import { sha256 } from "@noble/hashes/sha256";

/** Multihash prefix for SHA256: 0x12 + 32-byte digest (simplified encoding as hex for MVP). */
export function actorIdFromPublicKeyRaw(publicKey32: Uint8Array): string {
  if (publicKey32.length !== 32) {
    throw new Error("Ed25519 public key must be 32 bytes");
  }
  const digest = sha256(publicKey32);
  // Spec: relay:actor: + multihash(SHA-256). MVP uses 0x12 || digest as hex for readability in SQL.
  const mh = new Uint8Array(1 + digest.length);
  mh[0] = 0x12;
  mh.set(digest, 1);
  return `relay:actor:${bytesToHex(mh)}`;
}

export function channelIdFromSeed(seed: string): string {
  const digest = sha256(new TextEncoder().encode(`channel:${seed}`));
  const mh = new Uint8Array(1 + digest.length);
  mh[0] = 0x12;
  mh.set(digest, 1);
  return `relay:channel:${bytesToHex(mh)}`;
}

export function labelIdFromPayload(canonicalLabelPayloadJson: string): string {
  const digest = sha256(new TextEncoder().encode(canonicalLabelPayloadJson));
  return `relay:label:${bytesToHex(digest)}`;
}

export function eventIdFromPayload(canonicalEventPayloadJson: string): string {
  const digest = sha256(new TextEncoder().encode(canonicalEventPayloadJson));
  return `relay:event:${bytesToHex(digest)}`;
}

/** Stub signature for MVP — replace with real Ed25519 detached sig over canonical bytes. */
export function stubSignature(actorId: string, canonicalBytes: string): string {
  const h = sha256(new TextEncoder().encode(`stub|${actorId}|${canonicalBytes}`));
  return `stub:${bytesToHex(h)}`;
}

function bytesToHex(u: Uint8Array): string {
  return [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
}
