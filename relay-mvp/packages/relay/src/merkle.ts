/**
 * Snapshot Merkle tree and membership proof (§0.5.1).
 * @see Relay-Stack-Spec-v2.md §0.5.1
 */
import { sha256 } from "@noble/hashes/sha256";
import { canonicalStringify } from "@relay-mvp/protocol";
import { bytesToHex, hexToBytes } from "./bytes.js";
import type { RelaySnapshotProofV1, RelayStateV1 } from "./types.js";
const MERKLE_PAD = sha256(new TextEncoder().encode("relay.merkle.pad.v1"));

/** Leaf hash H_leaf = SHA-256(UTF-8 canonical state JSON) per §0.5.1 (same exclusions as signing pipeline). */
export function leafHashState(state: RelayStateV1): Uint8Array {
  const { id: _i, sig: _s, ...rest } = state;
  const canonical = canonicalStringify(rest);
  return sha256(new TextEncoder().encode(canonical));
}

export function merkleRootFromStates(states: RelayStateV1[]): string {
  const sorted = [...states].sort((a, b) => {
    const ab = new TextEncoder().encode(a.id);
    const bb = new TextEncoder().encode(b.id);
    const len = Math.max(ab.length, bb.length);
    for (let i = 0; i < len; i++) {
      const av = ab[i] ?? 0;
      const bv = bb[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
  let level: Uint8Array[] = sorted.map((s) => leafHashState(s));
  while (level.length > 1) {
    if (level.length % 2 === 1) level = [...level, MERKLE_PAD];
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1]!;
      const combined = new Uint8Array(64);
      combined.set(left, 0);
      combined.set(right, 32);
      next.push(sha256(combined));
    }
    level = next;
  }
  return bytesToHex(level[0]!);
}

export interface MerkleProofParts {
  leaf_index: number;
  merkle_path: string[];
  path_bits: (0 | 1)[];
  root_hash: string;
}

/**
 * Build Merkle proof for a state at index in sorted-by-id list (§0.5.1).
 */
export function merkleProofForIndex(states: RelayStateV1[], stateId: string): MerkleProofParts {
  const sorted = [...states].sort((a, b) => compareUtf8Id(a.id, b.id));
  const leafIndex = sorted.findIndex((s) => s.id === stateId);
  if (leafIndex < 0) throw new Error("state not in membership set");

  const leaves = sorted.map((s) => leafHashState(s));
  let level: Uint8Array[] = leaves;
  const merkle_path: string[] = [];
  const path_bits: (0 | 1)[] = [];
  let idx = leafIndex;

  while (level.length > 1) {
    if (level.length % 2 === 1) level = [...level, MERKLE_PAD];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = level[siblingIdx]!;
    merkle_path.push(bytesToHex(sibling));
    path_bits.push(isRight ? (1 as 0 | 1) : (0 as 0 | 1));
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1]!;
      const combined = new Uint8Array(64);
      combined.set(left, 0);
      combined.set(right, 32);
      next.push(sha256(combined));
    }
    idx = Math.floor(idx / 2);
    level = next;
  }

  return {
    leaf_index: leafIndex,
    merkle_path,
    path_bits,
    root_hash: bytesToHex(level[0]!)
  };
}

function compareUtf8Id(a: string, b: string): number {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    const av = ab[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Verify membership proof (§0.5.1 Verify normative).
 */
export function verifySnapshotProof(state: RelayStateV1, proof: RelaySnapshotProofV1): boolean {
  if (state.id !== proof.state_id) return false;
  const hLeaf = leafHashState(state);
  let h = hLeaf;
  for (let i = 0; i < proof.merkle_path.length; i++) {
    const s = hexToBytes(proof.merkle_path[i]!);
    if (s.length !== 32) return false;
    if (proof.path_bits[i] === 0) {
      const combined = new Uint8Array(64);
      combined.set(h, 0);
      combined.set(s, 32);
      h = sha256(combined);
    } else {
      const combined = new Uint8Array(64);
      combined.set(s, 0);
      combined.set(h, 32);
      h = sha256(combined);
    }
  }
  return bytesToHex(h) === proof.root_hash.replace(/^0x/, "").toLowerCase();
}
