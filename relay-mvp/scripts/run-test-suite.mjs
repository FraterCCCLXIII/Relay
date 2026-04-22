#!/usr/bin/env node
/**
 * Test suite: static checks, build CLI, then relay-mvp `test` / `private-channels` / optional `two-nodes`
 * when the corresponding origin(s) respond on /health.
 *
 *   pnpm test
 *
 * Static only:  TEST_ONLY_STATIC=1 pnpm test
 * Skip CLI:     SKIP_CLI_INTEGRATION=1 pnpm test
 * Full stack:   pnpm test:local
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cli = path.join(root, "packages", "cli", "dist", "index.js");

function pnpmRun(args, inherit = true) {
  const r = spawnSync("pnpm", args, { cwd: root, stdio: inherit ? "inherit" : "pipe", shell: true, env: process.env });
  return r.status ?? 1;
}

async function isHealthy(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return false;
    const j = await r.json();
    return j && j.ok;
  } catch {
    return false;
  }
}

async function main() {
  process.chdir(root);

  console.log("\n== typecheck (all packages) ==\n");
  if (pnpmRun(["run", "typecheck"]) !== 0) process.exit(1);

  console.log("\n== registry:validate ==\n");
  if (pnpmRun(["run", "registry:validate"]) !== 0) process.exit(1);

  console.log("\n== test:httpsig-vectors ==\n");
  if (pnpmRun(["run", "test:httpsig-vectors"]) !== 0) process.exit(1);

  if (process.env.TEST_ONLY_STATIC === "1") {
    console.log("\n→ TEST_ONLY_STATIC=1: done.\n");
    return;
  }

  console.log("\n== build @relay-mvp/cli ==\n");
  if (pnpmRun(["--filter", "@relay-mvp/cli", "run", "build"]) !== 0) process.exit(1);
  if (!existsSync(cli)) {
    console.error("Missing", cli);
    process.exit(1);
  }

  if (process.env.SKIP_CLI_INTEGRATION === "1") {
    console.log("\n→ SKIP_CLI_INTEGRATION=1: use  pnpm test:local  or start origin and  node packages/cli/dist/index.js test\n");
    return;
  }

  const originUrl = "http://127.0.0.1:3001";
  const indexerUrl = "http://127.0.0.1:3003";
  const originOk = await isHealthy(`${originUrl}/health`);
  if (!originOk) {
    console.log(
      "\n→ Origin not up — skipping relay-mvp CLI tests.\n" +
        "   Start:  pnpm dev:origin  or full  pnpm test:local\n",
    );
    return;
  }

  const indexerOk = await isHealthy(`${indexerUrl}/health`);
  const testArgs = [cli, "test", "--origin", originUrl];
  if (indexerOk) {
    testArgs.push("--indexer", indexerUrl);
  } else {
    console.log("→ Indexer not on :3003 — `relay-mvp test` without indexer\n");
  }

  const runCli = (name, args) => {
    console.log(`\n== ${name} ==\n`);
    const r = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });
    if (r.status !== 0) process.exit(r.status ?? 1);
  };

  runCli("relay-mvp test", testArgs);
  runCli("relay-mvp private-channels", [cli, "private-channels", "--origin", originUrl]);

  const originB = process.env.RELAY_MVP_TEST_ORIGIN_B || "http://127.0.0.1:3004";
  if (await isHealthy(new URL("/health", originB).toString())) {
    runCli("relay-mvp two-nodes", [cli, "two-nodes", "--a", originUrl, "--b", originB]);
  } else {
    console.log(
      `→ No second origin at ${originB} — skip two-nodes (use  pnpm test:two-nodes  for a full two-DB run)\n`,
    );
  }

  console.log("\n== CLI tests on running stack: OK ==\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
