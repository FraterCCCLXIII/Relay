import { describe, expect, it } from "vitest";
import {
  leafHashState,
  merkleProofForIndex,
  merkleRootFromStates,
  verifySnapshotProof
} from "./merkle.js";
import type { RelaySnapshotProofV1, RelayStateV1 } from "./types.js";

describe("Merkle snapshot (§0.5.1)", () => {
  it("builds root and verifies proof", () => {
    const a: RelayStateV1 = {
      actor: "relay:actor:a",
      content_class: "mutable_public",
      created_at: "2026-04-21T00:00:00Z",
      id: "relay:state:aa",
      payload: { body: "x" },
      sig: "00",
      storage_class: "state",
      type: "post",
      updated_at: "2026-04-21T00:00:00Z",
      version: 1
    };
    const b: RelayStateV1 = {
      ...a,
      id: "relay:state:bb",
      payload: { body: "y" }
    };
    const root = merkleRootFromStates([a, b]);
    const p = merkleProofForIndex([a, b], a.id);
    const proof: RelaySnapshotProofV1 = {
      kind: "relay.snapshot.proof.v1",
      leaf_index: p.leaf_index,
      merkle_path: p.merkle_path,
      path_bits: p.path_bits,
      root_hash: p.root_hash,
      snapshot_id: "s1",
      state_id: a.id
    };
    expect(p.root_hash).toBe(root);
    expect(verifySnapshotProof(a, proof)).toBe(true);
    expect(leafHashState(a).length).toBe(32);
  });
});
