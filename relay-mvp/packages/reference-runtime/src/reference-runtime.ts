/**
 * Local reference engine: persistence, boundary resolution, snapshot build (§0.5–0.7, §10, §11).
 * Deterministic view runs use pure `runFeedReduce` from @relay-mvp/relay.
 * Fork policy: reject when multiple heads (§17.10).
 * @see Relay-Stack-Spec-v2.md
 */
import { canonicalStringify } from "@relay-mvp/protocol";
import {
  boundaryHasFinitePin,
  runFeedReduce,
  merkleRootFromStates,
  merkleProofForIndex,
  assertValidEventId,
  assertValidStateId,
  verifyEventSignature,
  verifyStateSignature,
  sign,
  verifySnapshotProof,
  type BoundaryV2,
  type Ed25519Identity,
  type FeedDefinitionStateV1,
  type ReduceOutput,
  type RelayEventV1,
  type RelaySnapshotProofV1,
  type RelaySnapshotV1,
  type RelayStateV1
} from "@relay-mvp/relay";
import { collectEventsForEventRanges } from "./boundary-resolve.js";
import { forwardLogFromHead, listHeadsForActor } from "./log-order.js";
import type { ReferenceStorage } from "./storage.js";

export class ReferenceRuntime {
  constructor(
    private readonly store: ReferenceStorage,
    private readonly identity: Ed25519Identity
  ) {
    this.registerIdentity(identity);
  }

  /** Register an actor’s Ed25519 public key so this runtime can verify their events and states. */
  registerIdentity(id: Ed25519Identity): void {
    this.store.registerPublicKey(id.actor_id, id.publicKey);
  }

  listKnownActors(): string[] {
    return this.store.listRegisteredActorIds();
  }

  get storage(): ReferenceStorage {
    return this.store;
  }

  /**
   * Append after signature + id + `prev` check (linear chain — §10.1).
   */
  appendEvent(ev: RelayEventV1): void {
    assertValidEventId(ev);
    const pk = this.store.getPublicKey(ev.actor);
    if (!pk) throw new Error("actor_not_registered");
    if (!verifyEventSignature(ev, pk)) {
      throw new Error("event_signature_invalid");
    }
    const head = this.store.getActorHead(ev.actor);
    if (ev.prev !== head) {
      throw new Error("event_prev_mismatch");
    }
    this.store.putEvent(ev);
    this.store.setActorHead(ev.actor, ev.id);
  }

  putState(s: RelayStateV1): void {
    assertValidStateId(s);
    const pk = this.store.getPublicKey(s.actor);
    if (!pk) throw new Error("actor_not_registered");
    if (!verifyStateSignature(s, pk)) {
      throw new Error("state_signature_invalid");
    }
    this.store.putState(s);
  }

  getState(id: string): RelayStateV1 | undefined {
    return this.store.getState(id);
  }

  forwardLog(actor: string): RelayEventV1[] {
    return forwardLogFromHead(this.store, actor);
  }

  /**
   * UI affordance: latest closed per-actor window of at most `n` events → `event_ranges` (§0.6).
   */
  /**
   * Returns null if the actor has no events (no finite `event_ranges` possible).
   */
  latestClosedEventWindow(
    actor: string,
    n: number,
    extraScope?: BoundaryV2["state_scope"]
  ): BoundaryV2 | null {
    const log = this.forwardLog(actor);
    if (log.length === 0) return null;
    const slice = log.slice(-Math.min(n, log.length));
    const b: BoundaryV2 = {
      event_ranges: [
        {
          actor,
          from: slice[0]!.id,
          to: slice[slice.length - 1]!.id
        }
      ]
    };
    if (extraScope) b.state_scope = extraScope;
    return b;
  }

  /**
   * Closed boundary over the last at most `n` events per listed actor (§0.6.1), merged for reduce.
   * Omits actors with an empty log.
   */
  latestClosedEventWindowForActors(actors: string[], n: number, extraScope?: BoundaryV2["state_scope"]): BoundaryV2 | null {
    const ranges: NonNullable<BoundaryV2["event_ranges"]> = [];
    for (const actor of actors) {
      const log = this.forwardLog(actor);
      if (log.length === 0) continue;
      const slice = log.slice(-Math.min(n, log.length));
      ranges.push({
        actor,
        from: slice[0]!.id,
        to: slice[slice.length - 1]!.id
      });
    }
    if (ranges.length === 0) return null;
    const b: BoundaryV2 = { event_ranges: ranges };
    if (extraScope) b.state_scope = extraScope;
    return b;
  }

  assertNoForkForActors(actors: string[]): void {
    for (const a of actors) {
      const heads = listHeadsForActor(this.store, a);
      if (heads.length > 1) {
        throw new Error(`fork_ambiguous:${a}`);
      }
    }
  }

  /**
   * Deterministic feed run (§0.6, §11.1, §17.10) — resolves boundary, rejects forks, pure reduce.
   */
  runDeterministicFeed(def: FeedDefinitionStateV1, boundary: BoundaryV2): ReduceOutput {
    if (!boundaryHasFinitePin(boundary)) {
      throw new Error("boundary_not_finite");
    }
    const actors = actorLogSources(def);
    this.assertNoForkForActors(actors);
    const events = collectEventsForEventRanges(this.store, boundary);
    return runFeedReduce(def, events);
  }

  /**
   * Build snapshot (§0.5.1) and store membership set.
   */
  createSnapshot(
    id: string,
    asOf: string,
    scope: RelaySnapshotV1["scope"],
    pickStates: (all: RelayStateV1[]) => RelayStateV1[]
  ): RelaySnapshotV1 {
    const all = this.store.allStateIds().map((i) => this.store.getState(i)!);
    const members = pickStates(all);
    const root = merkleRootFromStates(members);
    const body = {
      as_of: asOf,
      id,
      kind: "relay.snapshot.v1" as const,
      partial: false,
      root_hash: root,
      scope
    };
    const sig = sign(this.identity, canonicalStringify(body));
    const snap: RelaySnapshotV1 = { ...body, sig };
    this.store.putSnapshot(snap, members);
    return snap;
  }

  getMerkleProof(snapshotId: string, stateId: string): RelaySnapshotProofV1 {
    const s = this.store.getSnapshot(snapshotId);
    if (!s) throw new Error("snapshot_not_found");
    const p = merkleProofForIndex(s.members, stateId);
    return {
      kind: "relay.snapshot.proof.v1",
      merkle_path: p.merkle_path,
      path_bits: p.path_bits,
      root_hash: p.root_hash,
      snapshot_id: snapshotId,
      state_id: stateId,
      leaf_index: p.leaf_index
    };
  }

  verifyMerkleProofForState(
    st: RelayStateV1,
    proof: RelaySnapshotProofV1
  ): boolean {
    return verifySnapshotProof(st, proof);
  }
}

function actorLogSources(def: FeedDefinitionStateV1): string[] {
  return def.payload.sources
    .filter((s): s is { kind: "actor_log"; actor_id: string } => (s as { kind?: string }).kind === "actor_log")
    .map((s) => s.actor_id);
}

/** Re-export pure helpers for apps. */
export { signState, sign, createIdentity } from "@relay-mvp/relay";
