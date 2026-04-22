#!/usr/bin/env node
import { runSmokeTests } from "./run-smoke.js";

function printHelp(): void {
  console.log(`relay-mvp — Relay MVP CLI

Usage:
  relay-mvp [test] [options]
  relay-mvp --help

Commands:
  test    Run HTTP smoke tests against a running origin (default).

Options (env fallbacks in parentheses):
  --origin <url>     Origin base URL (RELAY_MVP_ORIGIN, default http://127.0.0.1:3001)
  --indexer <url>    Optional indexer base URL (RELAY_MVP_INDEXER) — tests /indexer/* 
  --writer <slug>    X-Demo-Actor slug for list/log/snapshot/identity (default alice)
  --reader <slug>    X-Demo-Actor slug for /feed/home (default bob)

Examples:
  pnpm dev:origin
  pnpm --filter @relay-mvp/cli exec relay-mvp test
  relay-mvp test --origin http://127.0.0.1:3001 --indexer http://127.0.0.1:3003
`);
}

function argVal(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) {
    return argv[i + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const cmd =
    argv[0] === "test" || argv[0] === "smoke"
      ? argv[0]
      : argv[0] && !argv[0].startsWith("-")
        ? argv[0]
        : "test";
  if (cmd !== "test" && cmd !== "smoke") {
    console.error(`Unknown command: ${argv[0]}`);
    printHelp();
    process.exit(1);
  }

  const rest: string[] =
    argv[0] === "test" || argv[0] === "smoke"
      ? argv.slice(1)
      : !argv[0] || argv[0].startsWith("-")
        ? argv
        : argv.slice(1);
  const originUrl =
    argVal(rest, "--origin") ?? process.env.RELAY_MVP_ORIGIN ?? "http://127.0.0.1:3001";
  const indexerUrl = argVal(rest, "--indexer") ?? process.env.RELAY_MVP_INDEXER;
  const writer = argVal(rest, "--writer") ?? process.env.RELAY_MVP_WRITER ?? "alice";
  const reader = argVal(rest, "--reader") ?? process.env.RELAY_MVP_READER ?? "bob";

  await runSmokeTests({
    originUrl,
    indexerUrl: indexerUrl || undefined,
    writer,
    reader,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
