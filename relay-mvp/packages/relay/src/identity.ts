/**
 * Ed25519 identity and detached signatures (§4.3, §7.1).
 * @see Relay-Stack-Spec-v2.md §4.3, Part I §7.1
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { actorIdFromPublicKeyRaw } from "./ids.js";
import type { Ed25519Identity } from "./types.js";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

function bytesToHex(u: Uint8Array): string {
  return [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(sigHex: string): Uint8Array {
  const t = (sigHex.startsWith("ed25519:") ? sigHex.slice(8) : sigHex).replace(/^0x/, "");
  if (t.length % 2 !== 0) throw new Error("invalid signature hex");
  const u = new Uint8Array(t.length / 2);
  for (let i = 0; i < u.length; i++) u[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
  return u;
}

function ensureBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

export function createIdentity(): Ed25519Identity {
  const secretKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(secretKey);
  return {
    actor_id: actorIdFromPublicKeyRaw(publicKey),
    secretKey,
    publicKey
  };
}

export function sign(identity: Ed25519Identity, data: string | Uint8Array): string {
  const msg = ensureBytes(data);
  return bytesToHex(ed.sign(msg, identity.secretKey));
}

export function verify(publicKey: Uint8Array, data: string | Uint8Array, signatureHex: string): boolean {
  const msg = ensureBytes(data);
  const sig = hexToBytes(signatureHex);
  try {
    return ed.verify(sig, msg, publicKey);
  } catch {
    return false;
  }
}
