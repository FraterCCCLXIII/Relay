import { useCallback, useMemo, useState } from "react";
import {
  boundaryCanonicalString,
  canPostToChannel,
  createIdentity,
  DATA_TYPE_COMMENT,
  DATA_TYPE_POST,
  isChannelVisibleTo,
  isUserLikingTarget,
  likeCountForTarget,
  makeGlobalFeedDefinitionPayload,
  signEvent,
  signState,
  SOCIAL_LIKE,
  SOCIAL_UNLIKE,
  TYPE_CHANNEL,
  type ChannelConfigPayloadV1,
  type CommentPayloadV1,
  type Ed25519Identity,
  type FeedDefinitionStateV1,
  type PostPayloadV1,
  type RelayEventV1,
  type RelayStateV1
} from "@relay-mvp/relay";
import { MemoryStorage, ReferenceRuntime } from "@relay-mvp/reference-runtime";

const LABELS = ["Alice", "Bob", "Carol"] as const;

function buildFeedDef(signer: Ed25519Identity, actorIds: string[]): FeedDefinitionStateV1 {
  const now = new Date().toISOString();
  return signState(signer, {
    actor: signer.actor_id,
    content_class: "mutable_public",
    created_at: now,
    payload: makeGlobalFeedDefinitionPayload(actorIds),
    storage_class: "state",
    type: "relay.feed.definition.v1",
    updated_at: now,
    version: 1
  }) as unknown as FeedDefinitionStateV1;
}

function isPostCommit(ev: RelayEventV1): boolean {
  return ev.type === "state.commit" && (ev.data as { type?: string }).type === DATA_TYPE_POST;
}

function postBody(st: RelayStateV1 | undefined): string {
  if (!st) return "";
  const p = st.payload as unknown as PostPayloadV1;
  return String(p?.body ?? "");
}

function asChannelConfig(st: RelayStateV1 | undefined): ChannelConfigPayloadV1 | null {
  if (!st || st.type !== TYPE_CHANNEL) return null;
  return st.payload as unknown as ChannelConfigPayloadV1;
}

type FeedFilter = { kind: "all" } | { kind: "main" } | { kind: "channel"; channelId: string };

export function App() {
  const { runtime, signers, feedSigner } = useMemo(() => {
    const mem = new MemoryStorage();
    const idents = [createIdentity(), createIdentity(), createIdentity()] as [Ed25519Identity, Ed25519Identity, Ed25519Identity];
    const first = idents[0]!;
    const rt = new ReferenceRuntime(mem, first);
    for (const i of idents) rt.registerIdentity(i);
    return { runtime: rt, signers: idents, feedSigner: first };
  }, []);

  const [userIdx, setUserIdx] = useState(0);
  const [lastN, setLastN] = useState(40);
  const [version, setVersion] = useState(0);
  const [body, setBody] = useState("");
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [feedFilter, setFeedFilter] = useState<FeedFilter>({ kind: "all" });
  const [chName, setChName] = useState("");
  const [chVis, setChVis] = useState<"public" | "private">("public");
  const [chMembers, setChMembers] = useState<Set<string>>(() => new Set());

  const current = signers[userIdx]!;
  const knownActors = runtime.listKnownActors();

  const feedDef = useMemo(
    () => buildFeedDef(feedSigner, knownActors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knownActors.join("\u0000"), feedSigner]
  );

  const boundary = useMemo(() => {
    if (knownActors.length === 0) return null;
    return runtime.latestClosedEventWindowForActors(knownActors, lastN, undefined);
  }, [knownActors, lastN, runtime, version]);

  const reduce = useMemo(() => {
    if (!boundary) return null;
    try {
      return runtime.runDeterministicFeed(feedDef, boundary);
    } catch {
      return null;
    }
  }, [runtime, feedDef, boundary]);

  const channelStates: { id: string; st: RelayStateV1; cfg: ChannelConfigPayloadV1 }[] = useMemo(() => {
    const out: { id: string; st: RelayStateV1; cfg: ChannelConfigPayloadV1 }[] = [];
    for (const id of runtime.storage.allStateIds()) {
      const st = runtime.getState(id);
      const cfg = asChannelConfig(st);
      if (cfg) out.push({ id, st: st!, cfg });
    }
    return out;
  }, [runtime, version]);

  const postCommitsOrdered: { ev: RelayEventV1; st: RelayStateV1; post: PostPayloadV1 }[] = useMemo(() => {
    if (!reduce) return [];
    const out: { ev: RelayEventV1; st: RelayStateV1; post: PostPayloadV1 }[] = [];
    for (const eid of reduce.event_ids) {
      const ev = runtime.storage.getEvent(eid);
      if (!ev || !isPostCommit(ev)) continue;
      const sid = (ev.data as { state_id?: string }).state_id;
      if (!sid) continue;
      const st = runtime.getState(sid);
      if (!st) continue;
      const post = st.payload as unknown as PostPayloadV1;
      if (post.channel_id) {
        const cst = runtime.getState(post.channel_id);
        const cfg = asChannelConfig(cst);
        if (!cfg || !isChannelVisibleTo(cfg, current.actor_id)) continue;
      }
      if (feedFilter.kind === "main" && post.channel_id) continue;
      if (feedFilter.kind === "channel" && post.channel_id !== feedFilter.channelId) continue;
      out.push({ ev, st, post });
    }
    return out;
  }, [reduce, runtime, current.actor_id, feedFilter, version]);

  const getForward = useCallback((actor: string) => runtime.forwardLog(actor), [runtime, version]);

  const likeCount = useCallback(
    (targetStateId: string) => likeCountForTarget(knownActors, targetStateId, (actorId: string) => getForward(actorId)),
    [getForward, knownActors]
  );

  const isLiking = useCallback(
    (targetStateId: string) => isUserLikingTarget(getForward(current.actor_id), targetStateId),
    [current.actor_id, getForward, version]
  );

  const commentsFor = useCallback(
    (parentStateId: string) => {
      const res: { st: RelayStateV1; body: string }[] = [];
      for (const id of runtime.storage.allStateIds()) {
        const s = runtime.getState(id);
        if (!s || s.type !== "comment") continue;
        const p = s.payload as unknown as CommentPayloadV1;
        if (p.parent_state_id === parentStateId) {
          res.push({ st: s, body: p.body });
        }
      }
      return res.sort((a, b) => a.st.updated_at.localeCompare(b.st.updated_at));
    },
    [runtime, version]
  );

  const tick = useCallback(() => setVersion((v) => v + 1), []);

  const appendLike = useCallback(
    (targetStateId: string) => {
      const head = runtime.storage.getActorHead(current.actor_id);
      const now = new Date().toISOString();
      const liking = isUserLikingTarget(runtime.forwardLog(current.actor_id), targetStateId);
      const ev = signEvent(current, {
        actor: current.actor_id,
        content_class: "durable_public",
        data: { target_state_id: targetStateId },
        prev: head,
        storage_class: "log",
        ts: now,
        type: liking ? SOCIAL_UNLIKE : SOCIAL_LIKE
      });
      runtime.appendEvent(ev);
      tick();
    },
    [current, runtime, tick]
  );

  const publishPost = useCallback(() => {
    const t = body.trim();
    if (!t) return;
    let channelId: string | undefined;
    if (feedFilter.kind === "channel" && feedFilter.channelId) {
      const st = runtime.getState(feedFilter.channelId);
      const cfg = asChannelConfig(st);
      if (cfg && canPostToChannel(cfg, current.actor_id)) {
        channelId = feedFilter.channelId;
      }
    }
    const now = new Date().toISOString();
    const head = runtime.storage.getActorHead(current.actor_id);
    const st = signState(current, {
      actor: current.actor_id,
      content_class: "mutable_public",
      created_at: now,
      payload: { body: t, channel_id: channelId } as unknown as Record<string, unknown>,
      storage_class: "state",
      type: "post",
      updated_at: now,
      version: 1
    });
    runtime.putState(st);
    const ev = signEvent(current, {
      actor: current.actor_id,
      content_class: "durable_public",
      data: { state_id: st.id, type: DATA_TYPE_POST },
      prev: head,
      storage_class: "log",
      ts: now,
      type: "state.commit"
    });
    runtime.appendEvent(ev);
    setBody("");
    tick();
  }, [body, current, feedFilter, runtime, tick]);

  const publishComment = useCallback(
    (parentStateId: string) => {
      const t = (commentDraft[parentStateId] ?? "").trim();
      if (!t) return;
      const now = new Date().toISOString();
      const head = runtime.storage.getActorHead(current.actor_id);
      const st = signState(current, {
        actor: current.actor_id,
        content_class: "mutable_public",
        created_at: now,
        payload: { body: t, parent_state_id: parentStateId } as unknown as Record<string, unknown>,
        storage_class: "state",
        type: "comment",
        updated_at: now,
        version: 1
      });
      runtime.putState(st);
      const ev = signEvent(current, {
        actor: current.actor_id,
        content_class: "durable_public",
        data: { state_id: st.id, type: DATA_TYPE_COMMENT },
        prev: head,
        storage_class: "log",
        ts: now,
        type: "state.commit"
      });
      runtime.appendEvent(ev);
      setCommentDraft((c) => ({ ...c, [parentStateId]: "" }));
      tick();
    },
    [commentDraft, current, runtime, tick]
  );

  const createChannel = useCallback(() => {
    const name = chName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const head = runtime.storage.getActorHead(current.actor_id);
    const members = new Set<string>([current.actor_id, ...chMembers]);
    const payload: ChannelConfigPayloadV1 = {
      name,
      visibility: chVis,
      member_actor_ids: [...members].sort()
    };
    const st = signState(current, {
      actor: current.actor_id,
      content_class: "mutable_public",
      created_at: now,
      payload: payload as unknown as Record<string, unknown>,
      storage_class: "state",
      type: TYPE_CHANNEL,
      updated_at: now,
      version: 1
    });
    runtime.putState(st);
    const ev = signEvent(current, {
      actor: current.actor_id,
      content_class: "durable_public",
      data: { state_id: st.id, type: TYPE_CHANNEL },
      prev: head,
      storage_class: "log",
      ts: now,
      type: "state.commit"
    });
    runtime.appendEvent(ev);
    setChName("");
    setChMembers(new Set());
    tick();
  }, [chMembers, chName, chVis, current, runtime, tick]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div
      className="app"
      style={{ maxWidth: 580, margin: "0 auto", padding: "var(--space-xl) var(--space-lg)" }}
    >
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <h1 style={{ fontSize: "1.35rem", margin: 0, marginBottom: "var(--space-sm)" }}>Relay v2 — Twitter client (demo)</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", margin: 0, marginBottom: "var(--space-md)" }}>
          Likes, comments, and public/private channels in-memory. Feed merges all registered actors, reverse
          chronological.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", alignItems: "center" }}>
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Acting as</span>
          <select value={userIdx} onChange={(e) => setUserIdx(Number(e.target.value))} aria-label="Current user">
            {signers.map((s, i) => (
              <option key={s.actor_id} value={i}>
                {LABELS[i]} ({s.actor_id.slice(0, 18)}…)
              </option>
            ))}
          </select>
        </div>
      </header>

      <section style={{ marginBottom: "var(--space-xl)" }}>
        <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Feed view</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: "var(--color-text-muted)" }}>
            Last N (per-actor log window)
            <input
              type="number"
              min={1}
              max={100}
              value={lastN}
              onChange={(e) => setLastN(Number(e.target.value) || 1)}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}>
            <button
              type="button"
              className={feedFilter.kind === "all" ? "" : "ghost"}
              onClick={() => setFeedFilter({ kind: "all" })}
            >
              All
            </button>
            <button
              type="button"
              className={feedFilter.kind === "main" ? "" : "ghost"}
              onClick={() => setFeedFilter({ kind: "main" })}
            >
              Main (no channel)
            </button>
            {channelStates
              .filter(({ cfg }) => isChannelVisibleTo(cfg, current.actor_id))
              .map(({ id, cfg }) => (
                <button
                  key={id}
                  type="button"
                  className={feedFilter.kind === "channel" && feedFilter.channelId === id ? "" : "ghost"}
                  onClick={() => setFeedFilter({ kind: "channel", channelId: id })}
                >
                  #{cfg.name}
                  {cfg.visibility === "private" ? " (private)" : ""}
                </button>
              ))}
          </div>
        </div>
      </section>

      <section
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-lg)",
          marginBottom: "var(--space-xl)"
        }}
      >
        <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--color-text-muted)", marginTop: 0 }}>New post</h2>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          style={{ width: "100%" }}
          placeholder={
            feedFilter.kind === "channel"
              ? `Post in #${asChannelConfig(runtime.getState(feedFilter.channelId))?.name ?? "channel"}`
              : "What’s happening?"
          }
        />
        <div style={{ marginTop: "var(--space-sm)", display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={publishPost}>
            Post
          </button>
        </div>
      </section>

      <section
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-lg)",
          marginBottom: "var(--space-xl)"
        }}
      >
        <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--color-text-muted)", marginTop: 0 }}>Create channel</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <input value={chName} onChange={(e) => setChName(e.target.value)} placeholder="Channel name" />
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", flexWrap: "wrap" }}>
            <label>
              <input
                type="radio"
                name="vis"
                checked={chVis === "public"}
                onChange={() => setChVis("public")}
              />{" "}
              Public
            </label>
            <label>
              <input
                type="radio"
                name="vis"
                checked={chVis === "private"}
                onChange={() => setChVis("private")}
              />{" "}
              Private
            </label>
          </div>
          {chVis === "private" && (
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "var(--space-sm)" }}>Members (besides you)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                {signers
                  .map((s, i) => ({ s, i }))
                  .filter(({ s }) => s.actor_id !== current.actor_id)
                  .map(({ s, i }) => (
                    <label key={s.actor_id} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                      <input
                        type="checkbox"
                        checked={chMembers.has(s.actor_id)}
                        onChange={() => {
                          setChMembers((m) => {
                            const n = new Set(m);
                            if (n.has(s.actor_id)) n.delete(s.actor_id);
                            else n.add(s.actor_id);
                            return n;
                          });
                        }}
                      />
                      {LABELS[i]}
                    </label>
                  ))}
              </div>
            </div>
          )}
          <div>
            <button type="button" onClick={createChannel}>
              Create channel
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Feed</h2>
        {boundary && (
          <details style={{ marginTop: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
            <summary style={{ cursor: "pointer", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Boundary</summary>
            <pre style={{ fontSize: 11, background: "var(--color-elevated)", padding: "var(--space-sm)", overflow: "auto" }}>
              {boundaryCanonicalString(boundary)}
            </pre>
          </details>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {postCommitsOrdered.map(({ ev, st, post }) => (
            <li
              key={ev.id}
              style={{
                borderBottom: "1px solid var(--color-border)",
                padding: "var(--space-md) 0"
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                {ev.ts} · <code>{st.actor}</code>
                {post.channel_id && (() => {
                  const c = asChannelConfig(runtime.getState(post.channel_id));
                  return c ? <span> · #{c.name}</span> : null;
                })()}
              </div>
              <p style={{ margin: "var(--space-sm) 0" }}>{postBody(st)}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", flexWrap: "wrap" }}>
                <button type="button" className="like" onClick={() => appendLike(st.id)} aria-pressed={isLiking(st.id)}>
                  {isLiking(st.id) ? "♥ Unlike" : "♡ Like"} <span style={{ color: "var(--color-text-muted)" }}>({likeCount(st.id)})</span>
                </button>
                <button type="button" className="ghost" onClick={() => toggleExpand(st.id)}>
                  {expanded.has(st.id) ? "Hide comments" : "Comments"}
                </button>
              </div>
              {expanded.has(st.id) && (
                <div
                  style={{
                    marginTop: "var(--space-md)",
                    paddingLeft: "var(--space-md)",
                    borderLeft: "2px solid var(--color-border)"
                  }}
                >
                  {commentsFor(st.id).map((c) => (
                    <div key={c.st.id} style={{ marginBottom: "var(--space-sm)", fontSize: "0.95rem" }}>
                      <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>{c.st.actor}</span>
                      <div>{c.body}</div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
                    <input
                      value={commentDraft[st.id] ?? ""}
                      onChange={(e) => setCommentDraft((d) => ({ ...d, [st.id]: e.target.value }))}
                      placeholder="Add a comment"
                      style={{ flex: 1 }}
                    />
                    <button type="button" onClick={() => publishComment(st.id)}>
                      Reply
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {postCommitsOrdered.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>No posts in this view yet.</p>}
      </section>
    </div>
  );
}
