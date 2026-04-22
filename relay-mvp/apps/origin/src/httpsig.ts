import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { buildRelayHttpsigString, type IdentityDocument } from "@relay-mvp/protocol";
import { pool } from "./db.js";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

function bodyShaFromRequest(req: Request & { rawBody?: Buffer }): string {
  const buf = req.rawBody ?? Buffer.alloc(0);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * When `RELAY_MVP_HTTPSIG_REQUIRED=1`, mutating requests must include:
 * - `X-Ed25519-Key-Id` — matches `keys.active.id` (or history) on the actor identity
 * - `X-Ed25519-Signature` — base64 detached signature over `buildCanonicalString(method, path, sha256hex(body))`
 */
export function httpsigRequired(): boolean {
  return process.env.RELAY_MVP_HTTPSIG_REQUIRED === "1";
}

export function routeNeedsHttpsig(req: Request): boolean {
  if (!httpsigRequired()) return false;
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  const p = req.path;
  if (p.startsWith("/auth/")) return false;
  if (p === "/health" || p === "/") return false;
  if (p.startsWith("/.well-known/")) return false;
  if (p === "/internal/metrics") return false;
  return true;
}

function findKeyOnIdentity(doc: IdentityDocument, keyId: string) {
  const k = doc.keys?.active;
  if (k?.id === keyId) return k;
  for (const h of doc.keys?.history ?? []) {
    if (h.id === keyId) return h;
  }
  return null;
}

export async function verifyHttpsigForActor(
  req: Request & { rawBody?: Buffer },
  res: Response,
  actorId: string,
): Promise<boolean> {
  const keyId = req.header("x-ed25519-key-id")?.trim();
  const sigB64 = req.header("x-ed25519-signature")?.trim();
  if (!keyId || !sigB64) {
    res.status(401).json({ error: "httpsig_required", message: "X-Ed25519-Key-Id and X-Ed25519-Signature required" });
    return false;
  }

  const r = await pool.query<{ doc: IdentityDocument }>(
    "SELECT doc FROM identity_docs WHERE actor_id = $1",
    [actorId],
  );
  const doc = r.rows[0]?.doc;
  if (!doc) {
    res.status(401).json({ error: "identity_missing", message: "No identity document for signature verification" });
    return false;
  }
  const key = findKeyOnIdentity(doc, keyId);
  if (!key || key.alg !== "ed25519") {
    res.status(401).json({ error: "unknown_key", message: "Key id not on identity" });
    return false;
  }

  const path = `${(req as Request & { baseUrl?: string }).baseUrl ?? ""}${req.path || "/"}`;
  const sha = bodyShaFromRequest(req);
  const msg = new TextEncoder().encode(buildRelayHttpsigString(req.method, path, sha));

  let pub: Uint8Array;
  try {
    pub = Uint8Array.from(Buffer.from(key.public_key_b64, "base64"));
  } catch {
    res.status(401).json({ error: "bad_key" });
    return false;
  }
  let sig: Uint8Array;
  try {
    sig = Uint8Array.from(Buffer.from(sigB64, "base64"));
  } catch {
    res.status(401).json({ error: "bad_signature_encoding" });
    return false;
  }

  const ok = await ed.verify(sig, msg, pub);
  if (!ok) {
    res.status(401).json({ error: "signature_invalid" });
    return false;
  }
  return true;
}
