/**
 * Composed social patterns (posts, comments, likes, channels) on top of v2 event/state.
 * Conventions for the reference Twitter-style client — not a separate protocol tier.
 */
import type { RelayEventV1 } from "./types.js";

/** Event: append-only like for a post/comment state id. */
export const SOCIAL_LIKE = "social.like";
/** Event: retract like (toggles with social.like per last-write-per-actor in log order). */
export const SOCIAL_UNLIKE = "social.unlike";
/** `state.commit` data.type: published post. */
export const DATA_TYPE_POST = "post";
/** `state.commit` data.type: published comment. */
export const DATA_TYPE_COMMENT = "comment";
/** state.type and `state.commit` data.type: channel configuration. */
export const TYPE_CHANNEL = "relay.channel.config.v1";
/** Alias for `state.commit` payloads (same string as `TYPE_CHANNEL`). */
export const DATA_TYPE_CHANNEL = TYPE_CHANNEL;

function readTarget(data: Record<string, unknown> | undefined): string | null {
  const t = data?.["target_state_id"];
  return typeof t === "string" ? t : null;
}

/** Whether this actor’s forward log (oldest → newest) results in a “like” for the target. */
export function isUserLikingTarget(forwardUserLog: RelayEventV1[], targetStateId: string): boolean {
  let liked = false;
  for (const e of forwardUserLog) {
    if (e.type === SOCIAL_LIKE && readTarget(e.data) === targetStateId) liked = true;
    if (e.type === SOCIAL_UNLIKE && readTarget(e.data) === targetStateId) liked = false;
  }
  return liked;
}

/** Count distinct registered actors who currently like `target` (per forward logs). */
export function likeCountForTarget(
  actorIds: string[],
  targetStateId: string,
  getForwardLog: (actorId: string) => RelayEventV1[]
): number {
  let n = 0;
  for (const a of actorIds) {
    if (isUserLikingTarget(getForwardLog(a), targetStateId)) n++;
  }
  return n;
}

export function targetStateIdFromLikeEvent(e: RelayEventV1): string | null {
  if (e.type !== SOCIAL_LIKE && e.type !== SOCIAL_UNLIKE) return null;
  return readTarget(e.data);
}

export interface ChannelConfigPayloadV1 {
  name: string;
  visibility: "public" | "private";
  /** Actors who may read and post; always include the creator. */
  member_actor_ids: string[];
}

export function isChannelVisibleTo(ch: ChannelConfigPayloadV1, viewerActorId: string): boolean {
  if (ch.visibility === "public") return true;
  return ch.member_actor_ids.includes(viewerActorId);
}

export function canPostToChannel(ch: ChannelConfigPayloadV1, posterActorId: string): boolean {
  if (ch.visibility === "public") return true;
  return ch.member_actor_ids.includes(posterActorId);
}

export interface PostPayloadV1 {
  body: string;
  /** `relay:state:…` id of a `relay.channel.config.v1` state, if any. */
  channel_id?: string;
}

export interface CommentPayloadV1 {
  body: string;
  /** Parent post or comment `relay:state:…` id. */
  parent_state_id: string;
}

/**
 * `relay.feed.definition.v1` payload: merged logs from all listed actors, reverse chronological.
 */
export function makeGlobalFeedDefinitionPayload(actorIds: string[]) {
  const sorted = [...actorIds].sort();
  return {
    params: {} as Record<string, unknown>,
    reduce: "relay.reduce.reverse_chronological.v1" as const,
    sources: sorted.map((actor_id) => ({ kind: "actor_log" as const, actor_id }))
  };
}
