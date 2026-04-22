import type {
  ConflictErrorBody,
  IdentityDocument,
  LogEventEnvelope,
  StateObject,
} from "@relay-mvp/protocol";
import { buildSignedMessage } from "./httpsigClient.js";

export type HttpsigClientOpts = {
  keyId: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

export type OriginClientOptions = {
  baseUrl: string;
  /** MVP demo: actor slug (alice, bob, mod) when `authMode` is not `session` */
  demoActorSlug: string;
  /** Use `session` to send `credentials: "include"` and omit `X-Demo-Actor` (after `POST /auth/login`). */
  authMode?: "header" | "session";
  /** When origin has `RELAY_MVP_HTTPSIG_REQUIRED=1`, set this to sign mutating requests. */
  httpsig?: HttpsigClientOpts;
};

function u8ToB64(u: Uint8Array): string {
  let bin = "";
  for (const b of u) bin += String.fromCharCode(b);
  return btoa(bin);
}

export class OriginClient {
  private readonly root: string;

  constructor(private readonly o: OriginClientOptions) {
    this.root = o.baseUrl.replace(/\/$/, "");
  }

  private get creds(): RequestCredentials {
    return this.o.authMode === "session" ? "include" : "same-origin";
  }

  private toSignPath(url: string): string {
    const noHost = url.replace(/^https?:\/\/[^/]+/i, "");
    return noHost.split("?")[0] || "/";
  }

  private hdrGet(): RequestInit {
    if (this.o.authMode === "session") {
      return { headers: { Accept: "application/json" } };
    }
    return { headers: { "X-Demo-Actor": this.o.demoActorSlug, Accept: "application/json" } };
  }

  private async mutHeaders(
    method: "PUT" | "POST" | "DELETE",
    fullUrl: string,
    bodyStr: string | undefined,
  ): Promise<Record<string, string>> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.o.authMode !== "session") h["X-Demo-Actor"] = this.o.demoActorSlug;
    if (this.o.httpsig) {
      const path = this.toSignPath(fullUrl);
      const msg = buildSignedMessage(method, path, bodyStr);
      const sig = await this.o.httpsig.signMessage(msg);
      h["X-Ed25519-Key-Id"] = this.o.httpsig.keyId;
      h["X-Ed25519-Signature"] = u8ToB64(sig);
    }
    return h;
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

  async listActors(): Promise<Array<{ actor_id: string; slug: string }>> {
    const r = await fetch(`${this.root}/actors`, { credentials: this.creds, ...this.hdrGet() });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /actors");
  }

  async getIdentity(actorId: string): Promise<IdentityDocument> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/identity`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /identity");
  }

  async getState(actorId: string, objectId: string): Promise<StateObject> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/state/${encodeURIComponent(objectId)}`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /state");
  }

  /** Resolve object_id to state (authoritative actor embedded in response). */
  async getObject(objectId: string): Promise<StateObject> {
    const r = await fetch(`${this.root}/objects/${encodeURIComponent(objectId)}`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
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
    const u = `${this.root}/actors/${encodeURIComponent(actorId)}/state/${encodeURIComponent(objectId)}`;
    const bodyStr = JSON.stringify(body);
    const r = await fetch(u, {
      method: "PUT",
      headers: await this.mutHeaders("PUT", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (r.status === 409) {
      const j = await this.readJson<ConflictErrorBody>(r, "PUT /state conflict");
      throw Object.assign(new Error(j.message), { conflict: j });
    }
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "PUT /state");
  }

  async getLog(actorId: string, sinceSeq = 0): Promise<{ events: LogEventEnvelope[]; next_since_seq: number }> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/log?since_seq=${sinceSeq}`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /log");
  }

  async getSnapshot(actorId: string): Promise<unknown> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/snapshots/latest`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /snapshots/latest");
  }

  async homeFeed(): Promise<{ source: string; posts: StateObject[]; following: string[] }> {
    const r = await fetch(`${this.root}/feed/home`, { credentials: this.creds, ...this.hdrGet() });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /feed/home");
  }

  async listPosts(actorId: string): Promise<StateObject[]> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/posts`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /posts");
  }

  async follow(followerActorId: string, followeeId: string): Promise<LogEventEnvelope | { ok: boolean; note?: string }> {
    const u = `${this.root}/actors/${encodeURIComponent(followerActorId)}/follows`;
    const bodyStr = JSON.stringify({ followee_id: followeeId });
    const r = await fetch(u, {
      method: "POST",
      headers: await this.mutHeaders("POST", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "POST /follows");
  }

  async unfollow(followerActorId: string, followeeId: string): Promise<LogEventEnvelope> {
    const u = `${this.root}/actors/${encodeURIComponent(followerActorId)}/follows/${encodeURIComponent(followeeId)}`;
    const r = await fetch(u, {
      method: "DELETE",
      headers: await this.mutHeaders("DELETE", u, undefined),
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "DELETE /follows");
  }

  async following(actorId: string): Promise<string[]> {
    const r = await fetch(`${this.root}/actors/${encodeURIComponent(actorId)}/following`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /following");
  }

  async listChannels(): Promise<
    Array<{
      channel_id: string;
      title: string;
      owner_actor_id: string;
      description?: string | null;
      visibility?: string;
      created_at?: string;
    }>
  > {
    const r = await fetch(`${this.root}/channels`, { credentials: this.creds, ...this.hdrGet() });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /channels");
  }

  async getChannel(channelId: string): Promise<{
    channel: {
      channel_id: string;
      title: string;
      owner_actor_id: string;
      description?: string | null;
      visibility?: string;
      created_at?: string;
    };
    refs: Array<{ post_object_id: string; submitter_actor_id: string }>;
    private_welcome_plaintext?: string;
  }> {
    const r = await fetch(`${this.root}/channels/${encodeURIComponent(channelId)}`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
    if (r.status === 403) {
      const t = await r.text();
      throw new Error(`channel_forbidden: ${t}`);
    }
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /channels/:id");
  }

  async createChannel(body: {
    title: string;
    description?: string;
    visibility?: "public" | "private";
    welcome_plaintext?: string;
  }): Promise<{ channel: { channel_id: string } }> {
    const u = `${this.root}/channels`;
    const bodyStr = JSON.stringify(body);
    const r = await fetch(u, {
      method: "POST",
      headers: await this.mutHeaders("POST", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "POST /channels");
  }

  async listChannelMembers(channelId: string): Promise<{
    owner: { actor_id: string; slug: string };
    members: Array<{ actor_id: string; slug: string }>;
  }> {
    const r = await fetch(`${this.root}/channels/${encodeURIComponent(channelId)}/members`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /channels/.../members");
  }

  async addChannelMember(channelId: string, member_slug: string): Promise<{ ok: boolean }> {
    const u = `${this.root}/channels/${encodeURIComponent(channelId)}/members`;
    const bodyStr = JSON.stringify({ member_slug });
    const r = await fetch(u, {
      method: "POST",
      headers: await this.mutHeaders("POST", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "POST /channels/.../members");
  }

  async removeChannelMember(channelId: string, memberActorId: string): Promise<{ ok: boolean }> {
    const u = `${this.root}/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(memberActorId)}`;
    const r = await fetch(u, {
      method: "DELETE",
      headers: await this.mutHeaders("DELETE", u, undefined),
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "DELETE /channels/.../members/...");
  }

  async createChannelInvite(
    channelId: string,
    body?: { max_uses?: number; expires_in_hours?: number },
  ): Promise<{ token: string; invite_id: string }> {
    const u = `${this.root}/channels/${encodeURIComponent(channelId)}/invites`;
    const bodyStr = JSON.stringify(body ?? {});
    const r = await fetch(u, {
      method: "POST",
      headers: await this.mutHeaders("POST", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "POST /channels/.../invites");
  }

  async joinChannelWithToken(channelId: string, token: string): Promise<{ ok: boolean }> {
    const u = `${this.root}/channels/${encodeURIComponent(channelId)}/join`;
    const bodyStr = JSON.stringify({ token: token.trim() });
    const r = await fetch(u, {
      method: "POST",
      headers: await this.mutHeaders("POST", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "POST /channels/.../join");
  }

  async submitChannelRef(channelId: string, postObjectId: string, authorActorId: string): Promise<void> {
    const u = `${this.root}/channels/${encodeURIComponent(channelId)}/refs`;
    const bodyStr = JSON.stringify({ post_object_id: postObjectId, author_actor_id: authorActorId });
    const r = await fetch(u, {
      method: "POST",
      headers: await this.mutHeaders("POST", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
  }

  async listLabels(params: { target?: string; channel_id?: string }): Promise<unknown[]> {
    const q = new URLSearchParams();
    if (params.target) q.set("target", params.target);
    if (params.channel_id) q.set("channel_id", params.channel_id);
    const qs = q.toString();
    const path = `${this.root}/labels${qs ? `?${qs}` : ""}`;
    const r = await fetch(path, { credentials: this.creds, ...this.hdrGet() });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "GET /labels");
  }

  async applyLabel(body: {
    target_object_id: string;
    label: string;
    channel_id?: string;
    notes?: string;
  }): Promise<unknown> {
    const u = `${this.root}/labels`;
    const bodyStr = JSON.stringify(body);
    const r = await fetch(u, {
      method: "POST",
      headers: await this.mutHeaders("POST", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    return this.readJson(r, "POST /labels");
  }

  /** Direct replies (comments) to a post. */
  async getReplies(objectId: string): Promise<StateObject[]> {
    const r = await fetch(`${this.root}/objects/${encodeURIComponent(objectId)}/replies`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
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
    const r = await fetch(`${this.root}/reactions/summary?${q.toString()}`, {
      credentials: this.creds,
      ...this.hdrGet(),
    });
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
    const u = `${this.root}/actors/${encodeURIComponent(actorId)}/reactions`;
    const bodyStr = JSON.stringify(body);
    const r = await fetch(u, {
      method: "POST",
      headers: await this.mutHeaders("POST", u, bodyStr),
      body: bodyStr,
      credentials: this.creds,
    });
    if (!r.ok) throw new Error(await r.text());
    const j = await this.readJson<{
      like_count: number;
      liked_by_me: boolean;
    }>(r, "POST /reactions");
    return { like_count: j.like_count, liked_by_me: j.liked_by_me };
  }
}
