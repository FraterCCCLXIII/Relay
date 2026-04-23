/**
 * Content-addressed ids (§4.2) — same encoding as @relay-mvp/protocol ids.ts for events.
 * @see Relay-Stack-Spec-v2.md §4.2, §4.3; relay-mvp event/state hashing.
 */
import { sha256 } from "@noble/hashes/sha256";
import { canonicalStringify, eventIdFromPayload as eventIdFromCanonicalBytes } from "@relay-mvp/protocol";
import type { RelayEventV1, RelayStateV1 } from "./types.js";

function bytesToHex(u: Uint8Array): string {
  return [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Payload for id = SHA-256 over canonical form (sig and id excluded). */
export function eventPayloadForId(ev: Omit<RelayEventV1, "id" | "sig">): string {
  const o: Record<string, unknown> = {
    actor: ev.actor,
    content_class: ev.content_class,
    data: ev.data,
    prev: ev.prev,
    storage_class: ev.storage_class,
    ts: ev.ts,
    type: ev.type
  };
  if (ev.target !== undefined) o.target = ev.target;
  return canonicalStringify(o);
}

export function computeEventId(ev: RelayEventV1): string {
  const { id: _i, sig: _s, ...rest } = ev;
  return eventIdFromCanonicalBytes(eventPayloadForId(rest));
}

export function statePayloadForId(s: Omit<RelayStateV1, "id" | "sig">): string {
  return canonicalStringify({
    actor: s.actor,
    content_class: s.content_class,
    created_at: s.created_at,
    deleted: s.deleted,
    payload: s.payload,
    storage_class: s.storage_class,
    type: s.type,
    updated_at: s.updated_at,
    version: s.version
  });
}

export function stateIdFromPayload(canonicalStatePayloadJson: string): string {
  const digest = sha256(new TextEncoder().encode(canonicalStatePayloadJson));
  const mh = new Uint8Array(1 + digest.length);
  mh[0] = 0x12;
  mh.set(digest, 1);
  return `relay:state:${bytesToHex(mh)}`;
}

export function computeStateId(s: RelayStateV1): string {
  const { id: _i, sig: _s, ...rest } = s;
  return stateIdFromPayload(statePayloadForId(rest));
}

export { actorIdFromPublicKeyRaw } from "@relay-mvp/protocol";

/** Same as computeEventId but from pre-serialized canonical payload. */
export function eventIdFromPayloadString(canonicalJson: string): string {
  return eventIdFromCanonicalBytes(canonicalJson);
}
