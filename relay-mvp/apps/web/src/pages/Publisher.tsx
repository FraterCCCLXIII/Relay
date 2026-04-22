import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ConflictErrorBody, StateObject } from "@relay-mvp/protocol";
import { useDemoActor } from "../demoActor.js";

function newPostId(): string {
  return `post:${crypto.randomUUID()}`;
}

export function Publisher() {
  const { client, slug } = useDemoActor();
  const [searchParams] = useSearchParams();
  const [actorId, setActorId] = useState<string | null>(null);
  const [posts, setPosts] = useState<StateObject[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [editing, setEditing] = useState<StateObject | null>(null);
  const [conflict, setConflict] = useState<ConflictErrorBody | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [actorLoadError, setActorLoadError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Array<{ channel_id: string; title: string; owner_actor_id: string }>>([]);
  const [channelInput, setChannelInput] = useState("");

  const refresh = useCallback(async () => {
    setActorLoadError(null);
    try {
      const actors = await client.listActors();
      const me = actors.find((a) => a.slug === slug)?.actor_id ?? null;
      setActorId(me);
      if (me) setPosts(await client.listPosts(me));
      else setPosts([]);
      try {
        setChannels(await client.listChannels());
      } catch {
        setChannels([]);
      }
    } catch (e) {
      setActorId(null);
      setActorLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [client, slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const r = searchParams.get("reply_to");
    setReplyTo(r ?? "");
    const ch = searchParams.get("channel");
    if (ch) setChannelInput(ch);
  }, [searchParams]);

  const publishNew = async () => {
    if (!actorId || !body.trim()) return;
    setConflict(null);
    const objectId = newPostId();
    try {
      await client.putState(actorId, objectId, {
        schema: "post",
        payload: {
          title: title || undefined,
          body,
          reply_to: replyTo.trim() ? replyTo.trim() : null,
        },
        expected_version: 0,
      });
      const cid = channelInput.trim();
      let channelNote = "";
      if (cid) {
        try {
          await client.submitChannelRef(cid, objectId, actorId);
          channelNote = ` Added to channel.`;
        } catch (e) {
          channelNote = ` Channel ref failed (${e instanceof Error ? e.message : String(e)}). Your post exists; add it from the channel page if needed.`;
        }
      }
      setTitle("");
      setBody("");
      setReplyTo("");
      setChannelInput("");
      setMsg(`Created ${objectId} — stored at origin.${channelNote}`);
      await refresh();
    } catch (e) {
      const c = e as { conflict?: ConflictErrorBody };
      if (c.conflict) setConflict(c.conflict);
      else setMsg(String(e));
    }
  };

  const saveEdit = async () => {
    if (!actorId || !editing) return;
    setConflict(null);
    try {
      const p = editing.payload as { title?: string; body: string; reply_to?: string | null };
      await client.putState(actorId, editing.object_id, {
        schema: "post",
        payload: { ...p, title: title || undefined, body },
        expected_version: editing.version,
      });
      setEditing(null);
      setTitle("");
      setBody("");
      setMsg("Updated — new version at origin.");
      await refresh();
    } catch (e) {
      const c = e as { conflict?: ConflictErrorBody };
      if (c.conflict) {
        setConflict(c.conflict);
        setMsg("Version conflict. Refreshing from origin…");
        try {
          const auth = await client.getState(actorId, editing.object_id);
          setEditing(auth);
          const pp = auth.payload as { title?: string; body: string };
          setTitle(pp.title ?? "");
          setBody(pp.body);
        } catch {
          /* ignore */
        }
      } else setMsg(String(e));
    }
  };

  const tombstoneDelete = async (p: StateObject) => {
    if (!actorId) return;
    if (!confirm("Delete on origin? (public tombstone)")) return;
    setConflict(null);
    try {
      await client.putState(actorId, p.object_id, {
        schema: "post",
        payload: { ...(p.payload as object), body: "", title: "" },
        expected_version: p.version,
        deleted: true,
      });
      setMsg("Tombstoned on origin.");
      await refresh();
    } catch (e) {
      const c = e as { conflict?: ConflictErrorBody };
      if (c.conflict) setConflict(c.conflict);
      else setMsg(String(e));
    }
  };

  const startEdit = (p: StateObject) => {
    setEditing(p);
    const pp = p.payload as { title?: string; body: string };
    setTitle(pp.title ?? "");
    setBody(pp.body);
    setConflict(null);
    setMsg(null);
  };

  const canPost = Boolean(body.trim() && actorId);
  const postCta = !body.trim() ? "Add a message" : !actorId ? (actorLoadError ? "Can’t post — see error above" : "Waiting for actor…") : "Post";

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-twx-border bg-twx-bg/85 px-3 py-2 backdrop-blur dark:border-twx-dark-border dark:bg-twx-dark-bg/90">
        <div className="flex items-center gap-2">
          <Link
            to="/reader"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-500/10"
            aria-label="Back"
          >
            ←
          </Link>
          <h1 className="text-lg font-bold">{editing ? "Edit" : "New post"}</h1>
        </div>
      </header>
      {slug !== "alice" ? (
        <p className="m-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
          Tip: pick <strong>alice</strong> for the seeded account, or post as your current actor.
        </p>
      ) : null}
      {conflict ? (
        <div className="m-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm dark:border-rose-800 dark:bg-rose-950/40">
          <strong>Conflict</strong> expected v{conflict.expected_version}, origin has v{conflict.authoritative_version}. {conflict.message}
        </div>
      ) : null}
      {actorLoadError ? (
        <p className="m-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
          <strong>Origin unavailable.</strong> {actorLoadError} Check that the dev stack is running and <code>GET /api/origin/actors</code> works.
        </p>
      ) : null}
      {msg ? <p className="m-2 text-sm text-twx-muted dark:text-twx-dark-muted">{msg}</p> : null}
      {replyTo.trim() && !editing ? (
        <p className="m-2 rounded-xl border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-sm text-sky-900 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-100">
          Replying in thread. <code className="text-xs">reply_to: {replyTo.trim()}</code> — clear the field in the form for a top-level post.
        </p>
      ) : null}

      <div className="border-b border-twx-border p-3 dark:border-twx-dark-border">
        <div className="flex gap-2">
          <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-sky-400 to-cyan-600 text-center text-sm font-bold leading-9 text-white">
            {(slug[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <input
              className="w-full border-0 bg-transparent p-0 text-sm font-bold placeholder:text-twx-muted/70 focus:ring-0 dark:text-twx-dark-text dark:placeholder:text-twx-dark-muted/70"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="mt-1 min-h-[8rem] w-full resize-none border-0 bg-transparent p-0 text-[1.1rem] placeholder:text-twx-muted/80 focus:ring-0 dark:text-twx-dark-text dark:placeholder:text-twx-dark-muted/80"
              placeholder="What is happening?!"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <label className="mt-1 block text-xs text-twx-muted dark:text-twx-dark-muted">
              <span className="mb-0.5 block">Reply to (optional · object id)</span>
              <input
                className="w-full rounded border border-twx-border bg-twx-raised/50 px-2 py-1 font-mono text-xs dark:border-twx-dark-border dark:bg-twx-dark-raised/50"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="post:…"
              />
            </label>
            <label className="mt-2 block text-xs text-twx-muted dark:text-twx-dark-muted">
              <span className="mb-0.5 block font-medium text-twx-text/90 dark:text-twx-dark-text/90">Also add to channel (optional)</span>
              <input
                className="w-full rounded border border-twx-border bg-twx-raised/50 px-2 py-1.5 font-mono text-[13px] dark:border-twx-dark-border dark:bg-twx-dark-raised/50"
                list="publisher-channel-ids"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder="channel:… (type id or pick a title below)"
                autoComplete="off"
              />
              <datalist id="publisher-channel-ids">
                {channels.map((c) => (
                  <option key={c.channel_id} value={c.channel_id}>
                    {c.title}
                  </option>
                ))}
              </datalist>
              <span className="mt-0.5 block text-[11px] opacity-80">
                Submits a ref after your post is created (origin <code className="text-[10px]">POST /channels/…/refs</code>).
              </span>
            </label>
          </div>
        </div>
        {/* Sticky full-width CTA: stays on screen; disabled uses solid gray (not opacity) so the control is always obvious */}
        <div className="sticky bottom-0 z-20 -mx-3 -mb-3 mt-3 border-t border-twx-border bg-twx-bg/95 px-3 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:border-twx-dark-border dark:bg-twx-dark-bg/95">
          {editing ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="order-2 rounded-full border border-twx-border px-4 py-2.5 text-sm font-bold dark:border-twx-dark-border" onClick={() => { setEditing(null); setTitle(""); setBody(""); }}>
                Cancel
              </button>
              <button
                type="button"
                className={`order-1 min-h-11 w-full rounded-full px-4 py-2.5 text-sm font-bold sm:order-2 sm:min-w-[10rem] sm:w-auto ${!body.trim() ? "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400" : "bg-twx-blue text-white hover:bg-twx-blue-hover"}`}
                onClick={() => void saveEdit()}
                disabled={!body.trim()}
              >
                Save (v{editing.version})
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-center text-xs text-twx-muted dark:text-twx-dark-muted sm:text-left">
                {actorId ? (
                  <>
                    Posting as <span className="font-semibold text-twx-text dark:text-twx-dark-text">@{slug}</span>
                  </>
                ) : actorLoadError ? null : (
                  "Loading actor from origin…"
                )}
              </p>
              <button
                type="button"
                className={
                  canPost
                    ? "min-h-12 w-full rounded-full bg-twx-blue py-3 text-[16px] font-bold text-white shadow-sm hover:bg-twx-blue-hover"
                    : "min-h-12 w-full cursor-not-allowed rounded-full border border-slate-200 bg-slate-100 py-3 text-[16px] font-bold text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }
                onClick={() => void publishNew()}
                disabled={!canPost}
                aria-label={canPost ? "Post to feed" : postCta}
              >
                {canPost ? "Post" : postCta}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-2">
        <h2 className="px-2 text-lg font-bold">Your activity</h2>
        <ul className="mt-0 divide-y divide-twx-border dark:divide-twx-dark-border">
          {posts.map((p) => {
            const pl = p.payload as { title?: string; body?: string };
            return (
              <li key={p.object_id} className="px-2 py-3">
                <div className="text-xs text-twx-muted/90 dark:text-twx-dark-muted/90">{p.object_id}</div>
                <div className="font-bold">{pl.title ?? ""}</div>
                <div className="text-[15px] text-twx-text/90 dark:text-twx-dark-text/90">{p.deleted ? "Deleted" : pl.body}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-sm">
                  <button type="button" className="text-twx-blue hover:underline" onClick={() => startEdit(p)} disabled={p.deleted}>
                    Edit
                  </button>
                  <button type="button" className="text-rose-600 hover:underline dark:text-rose-400" onClick={() => void tombstoneDelete(p)} disabled={p.deleted}>
                    Delete
                  </button>
                  <Link className="text-twx-muted hover:underline dark:text-twx-dark-muted" to={`/post/${encodeURIComponent(p.actor_id)}/${encodeURIComponent(p.object_id)}`}>
                    View thread
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
