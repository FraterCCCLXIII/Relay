/**
 * Event id binding and signature checks (§10, §4.1).
 * @see Relay-Stack-Spec-v2.md Part I §10
 */
import { computeEventId, eventPayloadForId, eventIdFromPayloadString } from "./ids.js";
import { sign, verify } from "./identity.js";
import type { Ed25519Identity, RelayEventV1 } from "./types.js";

/** Bytes signed: UTF-8 canonical JSON of the event without `id` and `sig` (same material as id hash). */
export function eventSigningBytes(ev: Omit<RelayEventV1, "id" | "sig">): string {
  return eventPayloadForId(ev);
}

export function signEvent(identity: Ed25519Identity, ev: Omit<RelayEventV1, "id" | "sig">): RelayEventV1 {
  const id = eventIdFromPayloadString(eventPayloadForId(ev));
  const sig = sign(identity, eventSigningBytes(ev));
  return { ...ev, id, sig };
}

// Re-export computeEventId for callers that build in two steps
export { computeEventId, eventPayloadForId } from "./ids.js";

export function verifyEventSignature(ev: RelayEventV1, publicKey: Uint8Array): boolean {
  const { id: _i, ...restWithSig } = ev;
  const { sig, ...unsigned } = restWithSig;
  return verify(publicKey, eventSigningBytes(unsigned as Omit<RelayEventV1, "id" | "sig">), sig);
}

export function assertValidEventId(ev: RelayEventV1): void {
  const expected = computeEventId(ev);
  if (expected !== ev.id) throw new Error(`event_id_mismatch: expected ${expected} got ${ev.id}`);
}
