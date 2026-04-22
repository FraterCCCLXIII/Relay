#!/usr/bin/env node
/**
 * One-shot local integration test:
 * 1) pnpm run build
 * 2) docker compose up -d (unless SKIP_DOCKER=1 and you already have Postgres)
 * 3) db:migrate + db:seed (retries while DB comes up)
 * 4) origin + indexer in background (from built dist)
 * 5) relay-mvp CLI smoke (origin + optional indexer)
 * 6) SIGTERM origin/indexer, exit with CLI code
 */
import { spawn, execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const defaultDb = "postgres://relay:relay@localhost:5432/relay_mvp";

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? defaultDb,
};

const originUrl = "http://127.0.0.1:3001";
const indexerUrl = "http://127.0.0.1:3003";

const children = [];

function pnpmRun(scriptName) {
  execSync(`pnpm run ${scriptName}`, { cwd: root, stdio: "inherit", env, shell: true });
}

function runPnpmWithOutput(scriptName) {
  const r = spawnSync("pnpm", ["run", scriptName], {
    cwd: root,
    env,
    shell: true,
    encoding: "utf8",
  });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  if (r.status === 0) return;
  const err = new Error(out || `exit ${r.status ?? "unknown"}`);
  err.code = r.status;
  throw err;
}

/**
 * Retries when Postgres is still starting. Fails fast on bad credentials / role.
 */
async function migrateUntilReady() {
  const maxWaitMs = 60_000;
  const start = Date.now();
  let attempt = 0;
  let retried = false;
  while (Date.now() - start < maxWaitMs) {
    try {
      runPnpmWithOutput("db:migrate");
      if (retried) process.stdout.write("\n");
      return;
    } catch (e) {
      const text = e instanceof Error && e.message ? e.message : String(e);
      if (/role .*does not exist|password authentication failed|no pg_hba\.conf entry/i.test(text)) {
        throw new Error(
          `${text.slice(0, 800)}\n\n` +
            "Fix DATABASE_URL, or from relay-mvp/ run: docker compose up -d\n" +
            "(default user is postgres://relay:relay@localhost:5432/relay_mvp)\n" +
            "To skip auto-start: SKIP_DOCKER=1 pnpm test:local",
        );
      }
      if (attempt++ === 0) {
        process.stdout.write("→ waiting for Postgres (migrating) ");
      } else {
        process.stdout.write(".");
      }
      retried = true;
      if (!/ECONNREFUSED|connect ECONNREFUSED|Connection refused|timeout expired|getaddrinfo/i.test(text)) {
        throw e;
      }
      await sleep(1000);
    }
  }
  if (retried) process.stdout.write("\n");
  throw new Error("db:migrate: Postgres did not become reachable in time. Start Docker or your DB, then retry.");
}

function startServer(name, cwd, outLog = "pipe") {
  const c = spawn(
    process.execPath,
    [path.join(cwd, "dist", "index.js")],
    {
      cwd,
      env: { ...env },
      stdio: outLog === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
      detached: false,
    },
  );
  c.name = name;
  children.push(c);
  if (outLog === "pipe") {
    c.stdout?.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
    c.stderr?.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  }
  c.on("error", (e) => console.error(`[${name}]`, e));
  return c;
}

function cleanup() {
  for (const c of children) {
    if (c && !c.killed && c.pid) {
      try {
        c.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fails if something already answers HTTP OK on our API ports. */
async function assertApiPortsFree() {
  for (const [u, name] of [
    [`${originUrl}/health`, "origin:3001"],
    [`${indexerUrl}/health`, "indexer:3003"],
  ]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(400) });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j && j.ok) {
          throw new Error(
            `${name} already has a healthy server (${u}). Stop it or change ports before pnpm test:local.`,
          );
        }
      }
    } catch (e) {
      if (e && typeof e === "object" && "message" in e && /already has a healthy server/.test(String((e).message))) {
        throw e;
      }
      // ECONNREFUSED / fetch failed → port is free
    }
  }
}

async function waitForHealth(url, { timeoutMs = 90_000, label } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const j = await r.json();
        if (j && j.ok) return;
      }
    } catch {
      // retry
    }
    await sleep(300);
  }
  throw new Error(`Timeout waiting for ${label} at ${url}`);
}

async function main() {
  process.chdir(root);
  const skipDocker = process.env.SKIP_DOCKER === "1";

  console.log("→ pnpm run build (monorepo)\n");
  pnpmRun("build");

  if (!skipDocker) {
    console.log("\n→ docker compose up -d (Postgres 16 on :5432)\n");
    try {
      execSync("docker compose up -d", { cwd: root, stdio: "inherit", env, shell: true });
    } catch (e) {
      console.error(
        "\nDocker failed. If Postgres is already running, retry with: SKIP_DOCKER=1 pnpm test:local\n",
      );
      throw e;
    }
  } else {
    console.log("\n→ SKIP_DOCKER=1: assuming DATABASE_URL is reachable\n");
  }

  console.log("\n→ db:migrate");
  await migrateUntilReady();

  console.log("\n→ db:seed\n");
  pnpmRun("db:seed");

  const originCwd = path.join(root, "apps", "origin");
  const indexerCwd = path.join(root, "apps", "indexer");

  await assertApiPortsFree();

  console.log("\n→ start origin (3001) + indexer (3003) from dist/\n");
  const logMode = process.env.TEST_LOCAL_VERBOSE === "1" ? "inherit" : "pipe";
  startServer("origin", originCwd, logMode);
  startServer("indexer", indexerCwd, logMode);

  await waitForHealth(`${originUrl}/health`, { label: "origin" });
  await waitForHealth(`${indexerUrl}/health`, { label: "indexer" });

  console.log("\n→ @relay-mvp/cli smoke test\n");
  const cli = path.join(root, "packages", "cli", "dist", "index.js");
  const code = await new Promise((resolve) => {
    const t = spawn(
      process.execPath,
      [cli, "test", "--indexer", indexerUrl, "--origin", originUrl],
      { stdio: "inherit", env: { ...env }, cwd: root },
    );
    t.on("close", (c) => resolve(c ?? 1));
  });

  cleanup();
  await sleep(200);
  if (code !== 0) process.exit(code);
  console.log("\n→ test:local finished OK (servers stopped).\n");
  process.exit(0);
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

main().catch((e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});
