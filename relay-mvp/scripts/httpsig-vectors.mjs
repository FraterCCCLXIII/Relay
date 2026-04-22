#!/usr/bin/env node
import { createHash } from "node:crypto";

function buildRelayHttpsigString(method, path, bodySha256Hex) {
  return `${method.toUpperCase()}\n${path}\n${bodySha256Hex}\n`;
}

const m = "PUT";
const p = "/actors/relay%3Aactor%3A1/state/post%3A1";
const body = `{"schema":"post","payload":{"body":"h"}}`;
const sha = createHash("sha256").update(body, "utf8").digest("hex");
const s = buildRelayHttpsigString(m, p, sha);
if (s !== `PUT\n${p}\n${sha}\n`) {
  console.error("Mismatch", s);
  process.exit(1);
}
console.log("httpsig-vectors: ok");
