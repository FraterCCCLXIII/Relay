/**
 * State object signing and id check (§11, §4.1).
 * @see Relay-Stack-Spec-v2.md Part I §11
 */
import { computeStateId, stateIdFromPayload, statePayloadForId } from "./ids.js";
import { sign, verify } from "./identity.js";
import type { Ed25519Identity, RelayStateV1 } from "./types.js";

export function stateSigningBytes(s: Omit<RelayStateV1, "id" | "sig">): string {
  return statePayloadForId(s);
}

export function signState(identity: Ed25519Identity, s: Omit<RelayStateV1, "id" | "sig">): RelayStateV1 {
  const id = stateIdFromPayload(statePayloadForId(s));
  const sig = sign(identity, stateSigningBytes(s));
  return { ...s, id, sig };
}

export function verifyStateSignature(st: RelayStateV1, publicKey: Uint8Array): boolean {
  const { id: _i, sig, ...unsigned } = st;
  return verify(publicKey, stateSigningBytes(unsigned as Omit<RelayStateV1, "id" | "sig">), sig);
}

export function assertValidStateId(st: RelayStateV1): void {
  const expected = computeStateId(st);
  if (expected !== st.id) throw new Error(`state_id_mismatch: expected ${expected} got ${st.id}`);
}

export { computeStateId, statePayloadForId } from "./ids.js";
