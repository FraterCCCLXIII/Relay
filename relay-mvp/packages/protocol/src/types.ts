/** Relay v1.2 MVP subset — wire shapes used by this implementation. */

export type RelayProfile = "relay.profile.minimal" | "relay.profile.social";

export interface IdentityKey {
  id: string;
  alg: "ed25519";
  /** Raw 32-byte public key, base64 */
  public_key_b64: string;
}

export interface IdentityDocument {
  kind: "identity";
  actor_id: string;
  updated_at: string;
  relay_profiles: RelayProfile[];
  keys: { active: IdentityKey; history?: IdentityKey[] };
  display_name?: string;
  bio?: string;
  /** MVP: stub or ed25519 detached signature over canonical identity minus this field */
  signature?: string;
}

export type StorageClass = "dual" | "log_only" | "state_only";

export interface StateObject<TPayload = Record<string, unknown>> {
  kind: "state";
  object_id: string;
  actor_id: string;
  /** post | profile | channel_meta (MVP) */
  schema: string;
  version: number;
  storage_class: StorageClass;
  content_class: "public" | "durable_public";
  created_at: string;
  updated_at: string;
  deleted?: boolean;
  payload: TPayload;
  signature?: string;
}

export interface PostPayload {
  title?: string;
  body: string;
  /** Parent post object_id for threading */
  reply_to?: string | null;
}

export interface ProfilePayload {
  display_name: string;
  bio?: string;
}

export type LogEventType =
  | "follow.add"
  | "follow.remove"
  | "state.commit"
  | "state.delete"
  | "key.rotate"
  | "reaction.add"
  | "reaction.remove"
  | "channel.accept"
  | "channel.remove";

export interface LogEventEnvelope {
  kind: "log";
  event_id: string;
  actor: string;
  /** follow.*: followee actor_id */
  target?: string;
  type: LogEventType;
  ts: string;
  /** Genesis = null per §10.1 */
  prev: string | null;
  data: Record<string, unknown>;
  signature?: string;
}

export type LabelName =
  | "spam"
  | "harassment"
  | "impersonation"
  | "nsfw"
  | "removed_from_channel"
  | "trusted_source"
  | "misleading_context";

export interface LabelObject {
  kind: "label";
  id: string;
  issuer_actor_id: string;
  target_object_id: string;
  label: LabelName;
  scope?: string;
  /** channel_id when scope is channel */
  channel_id?: string;
  created_at: string;
  notes?: string;
  signature?: string;
}

export interface ChannelObject {
  kind: "channel";
  channel_id: string;
  owner_actor_id: string;
  title: string;
  description?: string;
  created_at: string;
  signature?: string;
}

export interface SnapshotLatest {
  snapshot_id: string;
  actor_id: string;
  as_of_ts: string;
  partial: boolean;
  state_objects: StateObject[];
  /** Last log event_id included in this snapshot boundary (MVP) */
  log_head_event_id: string | null;
}

export interface ConflictErrorBody {
  error: "conflict_detected";
  object_id: string;
  expected_version?: number;
  authoritative_version: number;
  message: string;
}

export interface IndexerPolicy {
  version: string;
  description: string;
  rules: Array<{ id: string; description: string; weight?: number }>;
}

export interface IndexerSources {
  as_of: string;
  feeds: Array<{
    actor_id: string;
    role: "followed" | "channel" | "global_seed";
    note: string;
  }>;
}

/** WebSocket relay (§18 subset) */
export type RelayClientMessage =
  | {
      type: "HELLO";
      actor_id: string;
      subscriptions: string[];
      /** MVP: optional demo token instead of auth.sig */
      demo_token?: string;
    }
  | { type: "PING" };

export type RelayServerMessage =
  | { type: "WELCOME"; session_id: string; server_time: string }
  | {
      type: "EVENT";
      source: "relay";
      topic: string;
      /** What happened — state update, log append, label, channel ref */
      envelope_kind: "state" | "log" | "label" | "channel_ref";
      payload: unknown;
    }
  | { type: "PONG" };
