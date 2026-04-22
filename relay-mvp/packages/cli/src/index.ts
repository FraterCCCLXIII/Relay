#!/usr/bin/env node
import { runSmokeTests } from "./run-smoke.js";
import { runTwoNodeTests } from "./run-two-node.js";
import { runPrivateChannelTests } from "./run-private-channels.js";

function printHelp(): void {
  console.log(`relay-mvp — Relay MVP CLI

Usage:
  relay-mvp [test] [options]
  relay-mvp two-nodes [options]
  relay-mvp private-channels [options]
  relay-mvp --help

Commands:
  test        Run HTTP smoke tests against a running origin (default).
  two-nodes   With two different origin base URLs, verify public HTTP interop
              (read A from the network; use B for local client calls).
  private-channels
              Private channel membership, server-side encryption check, join/remove,
              optional second origin disjoint channel list (RELAY_MVP_NODE_B / --b).

Options (test):
  --origin <url>     Origin base URL (RELAY_MVP_ORIGIN, default http://127.0.0.1:3001)
  --indexer <url>    Optional indexer base URL (RELAY_MVP_INDEXER) — tests /indexer/* 
  --writer <slug>    X-Demo-Actor slug for list/log/snapshot/identity (default alice)
  --reader <slug>    X-Demo-Actor slug for /feed/home (default bob)

Options (two-nodes):
  --a <url>          "Upstream" origin (e.g. http://127.0.0.1:3001) — public GETs
  --b <url>          "Local" origin (e.g. http://127.0.0.1:3004) — B client
  --reader <slug>    Actor on B for homeFeed (default bob)

Env: RELAY_MVP_NODE_A, RELAY_MVP_NODE_B, RELAY_MVP_READER (for two-nodes)

Options (private-channels):
  --origin <url>     Origin base URL (RELAY_MVP_ORIGIN, default http://127.0.0.1:3001)
  --b <url>          Optional second origin (RELAY_MVP_NODE_B) for two-DB “federated” checks

  DATABASE_URL       If set, psql verifies ciphertext does not store raw seed UTF-8 bytes

Examples:
  pnpm test:two-nodes
  relay-mvp two-nodes --a http://127.0.0.1:3001 --b http://127.0.0.1:3004
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
  if (cmd === "two-nodes" || cmd === "twonode") {
    const rest = argv[0] === "two-nodes" || argv[0] === "twonode" ? argv.slice(1) : argv;
    const a = argVal(rest, "--a") ?? process.env.RELAY_MVP_NODE_A ?? "http://127.0.0.1:3001";
    const b = argVal(rest, "--b") ?? process.env.RELAY_MVP_NODE_B ?? "http://127.0.0.1:3004";
    const reader = argVal(rest, "--reader") ?? process.env.RELAY_MVP_READER ?? "bob";
    await runTwoNodeTests({ originA: a, originB: b, readerOnB: reader });
    return;
  }

  if (cmd === "private-channels") {
    const rest = argv[0] === "private-channels" ? argv.slice(1) : argv;
    const originUrl =
      argVal(rest, "--origin") ?? process.env.RELAY_MVP_ORIGIN ?? "http://127.0.0.1:3001";
    const b = argVal(rest, "--b") ?? process.env.RELAY_MVP_NODE_B;
    await runPrivateChannelTests({ originBaseUrl: originUrl, secondOriginBaseUrl: b });
    return;
  }

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
