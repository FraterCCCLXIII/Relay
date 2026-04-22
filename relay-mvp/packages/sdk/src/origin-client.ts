import type {
  ConflictErrorBody,
  IdentityDocument,
  LogEventEnvelope,
  StateObject,
} from "@relay-mvp/protocol";

export type OriginClientOptions = {
  baseUrl: string;
  /** MVP demo: actor slug (alice, bob, mod) */
  demoActorSlug: string;
};

export class OriginClient {
  private readonly root: string;

  constructor(private readonly o: OriginClientOptions) {
    this.root = o.baseUrl.replace(/\/$/, "");
  }

  /** Detect Vite index.html / error pages mistaken for API responses. */
  private async readJson<T>(r: Response, ctx: string): Promise<T> {
    const text = await r.text();
    const t = text.trimStart();
    if (t.startsWith("<") || t.startsWith("<!")) {
      throw new Error(
        `${ctx}: got HTML instead of JSON (HTTP ${r.status}). Is the origin running (port 3001)? In dev, leave VITE_ORIGIN_URL unset so requests use /api/origin. Snippet: ${t.slice(0, 96).replace(/\s+/g, " ")}`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${ctx}: invalid JSON (HTTP ${r.status}): ${text.slice(0, 200)}`);
    }
  }

  private hdr(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-Demo-Actor": this.o.demoActorSlug,
    };
  }

  async listActors(): Promise<Array<{ actor_id: string; slug: string }>> {
    const r = await fetch(`${this.root}/actors`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /actors");
  }

  async getIdentity(actorId: string): Promise<IdentityDocument> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/identity`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /identity");
  }

  async getState(actorId: string, objectId: string): Promise<StateObject> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/state/${encodeURIComponent(objectId)}`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /state");
  }

  /** Resolve object_id to state (authoritative actor embedded in response). */
  async getObject(objectId: string): Promise<StateObject> {
    const r = await fetch(`${this.root}/objects/${encodeURIComponent(objectId)}`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /objects");
  }

  async putState(
    actorId: string,
    objectId: string,
    body: {
      schema: string;
      payload: Record<string, unknown>;
      expected_version?: number;
      deleted?: boolean;
    },
  ): Promise<StateObject> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/state/${encodeURIComponent(objectId)}`, {
      method: "PUT",
      headers: this.hdr(),
      body: JSON.stringify(body),
    });
    if (r.status === 409) {
      const j = await this.readJson<ConflictErrorBody>(r, "PUT /state conflict");
      throw Object.assign(new Error(j.message), { conflict: j });
    }
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "PUT /state");
  }

  async getLog(actorId: string, sinceSeq = 0): Promise<{ events: LogEventEnvelope[]; next_since_seq: number }> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/log?since_seq=${sinceSeq}`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /log");
  }

  async getSnapshot(actorId: string): Promise<unknown> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/snapshots/latest`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /snapshots/latest");
  }

  async homeFeed(): Promise<{ source: string; posts: StateObject[]; following: string[] }> {
    const r = await fetch(`${this.root}/feed/home`, { headers: this.hdr() });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /feed/home");
  }

  async listPosts(actorId: string): Promise<StateObject[]> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/posts`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /posts");
  }

  async follow(followerActorId: string, followeeId: string): Promise<LogEventEnvelope | { ok: boolean; note?: string }> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(followerActorId)}/follows`, {
      method: "POST",
      headers: this.hdr(),
      body: JSON.stringify({ followee_id: followeeId }),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "POST /follows");
  }

  async unfollow(followerActorId: string, followeeId: string): Promise<LogEventEnvelope> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(followerActorId)}/follows/${encodeURIComponent(followeeId)}`, {
      method: "DELETE",
      headers: this.hdr(),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "DELETE /follows");
  }

  async following(actorId: string): Promise<string[]> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/following`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /following");
  }

  async listChannels(): Promise<Array<{ channel_id: string; title: string; owner_actor_id: string }>> {
    const r = await fetch(`${this.root}/channels`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /channels");
  }

  async getChannel(channelId: string): Promise<{
    channel: { channel_id: string; title: string; owner_actor_id: string };
    refs: Array<{ post_object_id: string; submitter_actor_id: string }>;
  }> {
    const r = await fetch(`${this.root}/channels/${encodeURIComponent(channelId)}`);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /channels/:id");
  }

  async submitChannelRef(channelId: string, postObjectId: string, authorActorId: string): Promise<void> {
    const r = await fetch(`${this.root}/channels/${encodeURIComponent(channelId)}/refs`, {
      method: "POST",
      headers: this.hdr(),
      body: JSON.stringify({ post_object_id: postObjectId, author_actor_id: authorActorId }),
    });
    if (!r.ok) throw new Error(await r.text());
  }

  async listLabels(params: { target?: string; channel_id?: string }): Promise<unknown[]> {
    const q = new URLSearchParams();
    if (params.target) q.set("target", params.target);
    if (params.channel_id) q.set("channel_id", params.channel_id);
    const qs = q.toString();
    const path = `${this.root}/labels${qs ? `?${qs}` : ""}`;
    const r = await fetch(path);
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /labels");
  }

  async applyLabel(body: {
    target_object_id: string;
    label: string;
    channel_id?: string;
    notes?: string;
  }): Promise<unknown> {
    const r = await fetch(`${this.root}/labels`, {
      method: "POST",
      headers: this.hdr(),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "POST /labels");
  }

  /** Direct replies (comments) to a post. */
  async getReplies(objectId: string): Promise<StateObject[]> {
    const r = await fetch(`${this.root}/objects/${encodeURIComponent(objectId)}/replies`);
    if (!r.ok) throw new Error(await r.text());
    const j = await this.readJson<{ replies: StateObject[] }>(r, "GET /objects/.../replies");
    return j.replies;
  }

  /** Like counts, reply counts, and whether the demo actor liked each target. */
  async getReactionSummary(
    targets: string[],
  ): Promise<Record<string, { like_count: number; reply_count: number; liked_by_me: boolean }>> {
    if (targets.length === 0) return {};
    const q = new URLSearchParams();
    for (const t of targets) q.append("target", t);
    const r = await fetch(`${this.root}/reactions/summary?${q.toString()}`, { headers: this.hdr() });
    if (!r.ok) throw new Error(await r.text());
    const j = await this.readJson<{
      summaries: Record<string, { like_count: number; reply_count: number; liked_by_me: boolean }>;
    }>(r, "GET /reactions/summary");
    return j.summaries;
  }

  async toggleReaction(
    actorId: string,
    body: { target_object_id: string; action: "add" | "remove"; reaction_kind?: string },
  ): Promise<{ like_count: number; liked_by_me: boolean }> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/reactions`, {
      method: "POST",
      headers: this.hdr(),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    const j = await this.readJson<{
      like_count: number;
      liked_by_me: boolean;
    }>(r, "POST /reactions");
    return { like_count: j.like_count, liked_by_me: j.liked_by_me };
  }
}
