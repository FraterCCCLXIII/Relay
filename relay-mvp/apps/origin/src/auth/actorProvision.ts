import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { actorIdFromPublicKeyRaw, canonicalStringify, stubSignature, type IdentityDocument } from "@relay-mvp/protocol";
import type { PoolClient } from "pg";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const slugRe = /^[a-z0-9_]{3,32}$/;

export function validateSlug(s: string): true | { error: string } {
  const t = s.trim().toLowerCase();
  if (!slugRe.test(t)) {
    return { error: "slug: use 3–32 chars: lowercase letters, digits, underscore only" };
  }
  return true;
}

export function validateEmail(s: string): true | { error: string } {
  const t = s.trim().toLowerCase();
  if (t.length < 3 || t.length > 254) return { error: "invalid email" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { error: "invalid email" };
  return true;
}

/**
 * Create a new Ed25519 actor, identity document, and insert into `actors` + `identity_docs`.
 * Caller is responsible for transaction boundaries and for inserting `local_accounts` / `oauth_accounts`.
 */
export async function insertNewActor(
  c: PoolClient,
  rawSlug: string,
  displayName: string,
): Promise<{ actor_id: string; slug: string; public_key_b64: string }> {
  const sl = rawSlug.trim().toLowerCase();
  const v = validateSlug(sl);
  if (v !== true) throw new Error("slug_invalid");
  const taken = await c.query("SELECT 1 FROM actors WHERE LOWER(slug) = LOWER($1) LIMIT 1", [sl]);
  if (taken.rows[0]) throw new Error("slug_taken");

  const priv = ed.utils.randomPrivateKey();
  const pub = await ed.getPublicKey(priv);
  const actorId = actorIdFromPublicKeyRaw(pub);
  const pkB64 = Buffer.from(pub).toString("base64");
  const now = new Date().toISOString();

  const identity: IdentityDocument = {
    kind: "identity",
    actor_id: actorId,
    updated_at: now,
    relay_profiles: ["relay.profile.social"],
    keys: { active: { id: "key:active:1", alg: "ed25519", public_key_b64: pkB64 } },
    display_name: displayName,
    bio: "Relay user",
  };
  const sig = stubSignature(actorId, canonicalStringify({ ...identity, signature: undefined }));
  const doc = { ...identity, signature: sig };

  await c.query("INSERT INTO actors (actor_id, slug, public_key_b64) VALUES ($1, $2, $3)", [actorId, sl, pkB64]);
  await c.query("INSERT INTO identity_docs (actor_id, doc, updated_at) VALUES ($1, $2, $3::timestamptz)", [actorId, doc, now]);

  return { actor_id: actorId, slug: sl, public_key_b64: pkB64 };
}
