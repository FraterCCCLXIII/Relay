#!/usr/bin/env node
/**
 * End-to-end two distinct origins (two Postgres DBs) + CLI `two-nodes` interop check.
 * 1) monorepo build
 * 2) docker compose up (unless SKIP_DOCKER=1)
 * 3) create `relay_mvp_b` if missing; migrate+seed A (`relay_mvp`) and B (`relay_mvp_b`)
 * 4) start origin A :3001 and origin B :3004 from dist/
 * 5) @relay-mvp/cli `two-nodes` (A public reads + B local client; separate actor_id namespaces)
 * 6) stop origins
 *
 * Reuse (origins already up): RELAY_MVP_TWO_NODE_REUSE=1 pnpm test:two-nodes
 * (still builds CLI; skips Docker, DB, and new processes).
 */
import { spawn, execSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
/** When `.env` is missing; prefer 127.0.0.1 to match typical TCP resolution. */
const defaultDb = "postgres://relay:relay@127.0.0.1:5432/relay_mvp";

const originAUrl = "http://127.0.0.1:3001";
const originBUrl = "http://127.0.0.1:3004";

const children = [];

/** Load `relay-mvp/.env` (does not override real env). */
function loadLocalDotenv() {
  const p = path.join(root, ".env");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

loadLocalDotenv();

const baseEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? defaultDb,
};

/** Same host:port and credentials as `base`, different database (for second origin). */
function withDatabaseName(baseConnectionString, databaseName) {
  const u = new URL(baseConnectionString);
  u.pathname = `/${databaseName}`;
  return u.toString();
}

function adminPostgresUrl(databaseUrl) {
  const u = new URL(databaseUrl);
  u.pathname = "/postgres";
  return u;
}

/**
 * Create `relay_mvp_b` on the **same** Postgres as `dbUrlA` (same host, port, user as `relay_mvp`).
 * Deriving B’s URL with `withDatabaseName` is wrong if this creates the DB in a different cluster
 * (e.g. `psql` to your real server vs `docker exec` to another).
 *
 * @param {string} dbUrlA
 */
function ensureDatabaseBExists(dbUrlA) {
  const admin = adminPostgresUrl(dbUrlA).toString();
  const tryPsql = () => {
    execSync(`psql "${admin}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE relay_mvp_b;"`, {
      stdio: "pipe",
      env: baseEnv,
      shell: true,
    });
  };
  const tryDockerExec = () => {
    execSync('docker compose exec -T postgres psql -U relay -d postgres -c "CREATE DATABASE relay_mvp_b;"', {
      cwd: root,
      stdio: "pipe",
      env: baseEnv,
      shell: true,
    });
  };
  try {
    tryPsql();
  } catch (e) {
    /** execSync: stderr is often the only place with SQL errors; stdout may be an empty buffer (truthy). */
    const t = [e?.stdout, e?.stderr, e?.message, String(e)]
      .map((x) => (x != null ? (Buffer.isBuffer(x) ? x.toString() : String(x)) : ""))
      .join("\n")
      .toLowerCase();
    const isDup = /already exists|42p04|duplicate database/.test(t);
    if (isDup) return;
    const isPsqlMissing = /command not found|not recognized|enoent|spawnfail/i.test(t);
    if (isPsqlMissing) {
      try {
        tryDockerExec();
        return;
      } catch (e2) {
        const t2 = ((e2 && (e2.stderr || e2.message)) || String(e2)).toString();
        if (/already exists|42P04|42p04|duplicate database/i.test(t2)) return;
        throw new Error(
          `${(e2 && e2.message) || t2}\n` +
            "Install `psql` on your PATH, or from relay-mvp/ run: docker compose up -d, " +
            "or create `relay_mvp_b` manually: CREATE DATABASE relay_mvp_b;",
        );
      }
    }
    throw e;
  }
}

function pnpmRun(scriptName, env) {
  execSync(`pnpm run ${scriptName}`, { cwd: root, stdio: "inherit", env: { ...baseEnv, ...env }, shell: true });
}

function runPnpmWithOutput(scriptName, extraEnv) {
  const r = spawnSync("pnpm", ["run", scriptName], {
    cwd: root,
    env: { ...baseEnv, ...extraEnv },
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
 * Retries when Postgres is still starting.
 * @param {() => void} runOnce
 * @param {string} label
 */
async function retryDbUntilReady(runOnce, label) {
  const maxWaitMs = 60_000;
  const start = Date.now();
  let attempt = 0;
  let retried = false;
  while (Date.now() - start < maxWaitMs) {
    try {
      runOnce();
      if (retried) process.stdout.write("\n");
      return;
    } catch (e) {
      const text = e instanceof Error && e.message ? e.message : String(e);
      if (/role .*does not exist|password authentication failed|no pg_hba\.conf entry/i.test(text)) {
        throw new Error(
          `${text.slice(0, 800)}\n\n` + "Fix DATABASE_URL, or from relay-mvp/ run: docker compose up -d\n",
        );
      }
      if (attempt++ === 0) {
        process.stdout.write(`→ waiting for Postgres (${label}) `);
      } else {
        process.stdout.write(".");
      }
      retried = true;
      if (
        !/ECONNREFUSED|connect ECONNREFUSED|Connection refused|timeout expired|getaddrinfo|No such file or directory|Is the server running|the database system is starting up|connection refused|could not connect/i.test(
          text,
        )
      ) {
        throw e;
      }
      await sleep(1000);
    }
  }
  if (retried) process.stdout.write("\n");
  throw new Error(`${label}: Postgres did not become reachable in time.`);
}

/**
 * @param {string} name
 * @param {string} cwd
 * @param {Record<string, string>} extraEnv
 * @param {"pipe" | "inherit"} outLog
 */
function startServer(name, cwd, extraEnv, outLog = "pipe") {
  const c = spawn(
    process.execPath,
    [path.join(cwd, "dist", "index.js")],
    {
      cwd,
      env: { ...baseEnv, ...extraEnv },
      stdio: outLog === "inherit" ? "inherit" : "pipe",
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

/**
 * Fails if something already answers HTTP OK on 3001 or 3004.
 * @param {string} url
 * @param {string} name
 */
async function assertPortFree(url, name) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(400) });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      if (j && j.ok) {
        throw new Error(
          `${name} already has a healthy server (${url}). Stop it or set RELAY_MVP_TWO_NODE_REUSE=1 to skip spawning.`,
        );
      }
    }
  } catch (e) {
    if (e && typeof e === "object" && "message" in e && /already has a healthy server/.test(String((e).message))) {
      throw e;
    }
  }
}

async function assertTwoNodePortsFree() {
  for (const [u, n] of [
    [`${originAUrl}/health`, "origin A :3001"],
    [`${originBUrl}/health`, "origin B :3004"],
  ]) {
    await assertPortFree(u, n);
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

async function runTwoNodeCli() {
  const cli = path.join(root, "packages", "cli", "dist", "index.js");
  return await new Promise((resolve) => {
    const t = spawn(
      process.execPath,
      [cli, "two-nodes", "--a", originAUrl, "--b", originBUrl],
      { stdio: "inherit", env: { ...baseEnv }, cwd: root },
    );
    t.on("close", (c) => resolve(c ?? 1));
  });
}

async function main() {
  process.chdir(root);
  if (process.env.RELAY_MVP_TWO_NODE_REUSE === "1") {
    console.log("→ RELAY_MVP_TWO_NODE_REUSE=1: build + two-nodes CLI only (expects A :3001 and B :3004)\n");
    execSync("pnpm run build", { cwd: root, stdio: "inherit", env: { ...baseEnv }, shell: true });
    const code = await runTwoNodeCli();
    process.exit(code === 0 ? 0 : code);
  }

  const skipDocker = process.env.SKIP_DOCKER === "1";
  const dbUrlA = baseEnv.DATABASE_URL;
  /** Must share host/port with A, or you may hit a different local Postgres. */
  const dbUrlB = process.env.RELAY_MVP_DATABASE_URL_B ?? withDatabaseName(dbUrlA, "relay_mvp_b");

  console.log("→ pnpm run build (monorepo)\n");
  execSync("pnpm run build", { cwd: root, stdio: "inherit", env: { ...baseEnv, DATABASE_URL: dbUrlA }, shell: true });

  if (!skipDocker) {
    console.log("\n→ docker compose up -d (Postgres 16 on :5432)\n");
    try {
      execSync("docker compose up -d", { cwd: root, stdio: "inherit", env: { ...baseEnv, DATABASE_URL: dbUrlA }, shell: true });
    } catch (e) {
      console.error("\nDocker failed. If Postgres is already running, retry with: SKIP_DOCKER=1 pnpm test:two-nodes\n");
      throw e;
    }
  } else {
    console.log("\n→ SKIP_DOCKER=1: using DATABASE_URL as-is; creating relay_mvp_b via local psql if needed\n");
  }

  console.log("\n→ ensure second database (relay_mvp_b)");
  await retryDbUntilReady(
    () => {
      ensureDatabaseBExists(dbUrlA);
    },
    "create relay_mvp_b",
  );

  const envA = { DATABASE_URL: dbUrlA };
  const envB = { DATABASE_URL: dbUrlB };

  console.log("\n→ db:migrate + db:seed (node A, relay_mvp)\n");
  await retryDbUntilReady(
    () => {
      runPnpmWithOutput("db:migrate", envA);
    },
    "migrate A",
  );
  pnpmRun("db:seed", envA);

  console.log("\n→ db:migrate + db:seed (node B, relay_mvp_b)\n");
  await retryDbUntilReady(
    () => {
      runPnpmWithOutput("db:migrate", envB);
    },
    "migrate B",
  );
  pnpmRun("db:seed", envB);

  await assertTwoNodePortsFree();

  const originCwd = path.join(root, "apps", "origin");
  const logMode = process.env.TEST_TWO_NODE_VERBOSE === "1" ? "inherit" : "pipe";
  startServer("origin-a", originCwd, { ...envA, ORIGIN_PORT: "3001" }, logMode);
  startServer("origin-b", originCwd, { ...envB, ORIGIN_PORT: "3004" }, logMode);

  console.log("\n→ two origins: http://127.0.0.1:3001 and http://127.0.0.1:3004\n");
  await waitForHealth(`${originAUrl}/health`, { label: "origin A" });
  await waitForHealth(`${originBUrl}/health`, { label: "origin B" });

  console.log("\n→ @relay-mvp/cli two-nodes\n");
  const code = await runTwoNodeCli();

  cleanup();
  await sleep(200);
  if (code !== 0) process.exit(code);
  console.log("\n→ test:two-nodes finished OK (origins stopped).\n");
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
