/**
 * v2-normative wire shapes (Part I) used by @relay-mvp/relay.
 * @see Relay-Stack-Spec-v2.md §0, §10, §11, §0.5, §0.6
 */

/** Log event (§10; role relay.event.v1) */
export interface RelayEventV1 {
  id: string;
  actor: string;
  prev: string | null;
  ts: string;
  type: string;
  data: Record<string, unknown>;
  content_class: string;
  storage_class: string;
  target?: string;
  sig: string;
}

/** State (§11; role relay.state.v1) */
export interface RelayStateV1 {
  id: string;
  actor: string;
  type: string;
  version: number;
  created_at: string;
  updated_at: string;
  content_class: string;
  storage_class: string;
  payload: Record<string, unknown>;
  deleted?: boolean;
  sig: string;
}

/** Feed / ViewDefinition (§11.1) */
export interface RelayFeedDefinitionV1 {
  sources: Array<{ kind: "actor_log"; actor_id: string } | Record<string, unknown>>;
  reduce: string;
  params?: Record<string, unknown>;
}

export type FeedDefinitionStateV1 = Omit<RelayStateV1, "type" | "payload"> & {
  type: "relay.feed.definition.v1";
  payload: RelayFeedDefinitionV1;
};

/** v2 Boundary (§0.6) */
export interface BoundaryV2 {
  snapshot?: string;
  event_ranges?: Array<{
    actor: string;
    from: string;
    to: string;
  }>;
  state_scope?: {
    actors?: string[];
    types?: string[];
    id_range?: { from: string; to: string };
  };
  id_range?: { from: string; to: string };
}

export interface SnapshotScopeV2 {
  actors?: string[];
  types?: string[];
  id_range?: { from: string; to: string };
}

/** relay.snapshot.v1 (§0.5) */
export interface RelaySnapshotV1 {
  kind: "relay.snapshot.v1";
  id: string;
  as_of: string;
  root_hash: string;
  scope: SnapshotScopeV2;
  partial: boolean;
  sig: string;
}

export interface RelaySnapshotProofV1 {
  kind: "relay.snapshot.proof.v1";
  snapshot_id: string;
  state_id: string;
  leaf_index: number;
  merkle_path: string[];
  path_bits: (0 | 1)[];
  root_hash: string;
}

/** 32-byte Ed25519 seed (see @noble/ed25519 utils.randomPrivateKey). */
export interface Ed25519Identity {
  actor_id: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export type ReduceId = "relay.reduce.chronological.v1" | "relay.reduce.reverse_chronological.v1";

export interface ResolvedViewInputsV2 {
  /** Event bodies keyed by id; reducer reads these for ts tie-break. */
  events: Map<string, RelayEventV1>;
  /** State objects keyed by id (as needed for optional interpretation). */
  stateById?: Map<string, RelayStateV1>;
}
