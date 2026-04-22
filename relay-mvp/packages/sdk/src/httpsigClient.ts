import { buildRelayHttpsigString } from "@relay-mvp/protocol";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export function bodySha256HexFromString(body: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(body)));
}

export function buildSignedMessage(method: string, signPath: string, body: string | undefined): Uint8Array {
  const sha = bodySha256HexFromString(body ?? "");
  return new TextEncoder().encode(buildRelayHttpsigString(method, signPath, sha));
}
