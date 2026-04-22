import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { StateObject } from "@relay-mvp/protocol";
import { PostCard } from "@relay-mvp/ui";
import { useDemoActor } from "../demoActor.js";

type LabelRow = { label: string; channel_id?: string | null };

type View =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      ch: Awaited<ReturnType<import("@relay-mvp/sdk").OriginClient["getChannel"]>>;
      actors: Array<{ actor_id: string; slug: string }>;
    };

export function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const { client, slug } = useDemoActor();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [joinToken, setJoinToken] = useState("");
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [refInput, setRefInput] = useState("");
  const [refErr, setRefErr] = useState<string | null>(null);
  const [owners, setOwners] = useState<{
    owner: { actor_id: string; slug: string };
    members: Array<{ actor_id: string; slug: string }>;
  } | null>(null);
  const [addSlug, setAddSlug] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [mgmtErr, setMgmtErr] = useState<string | null>(null);

  const myActorId = useMemo(() => {
    if (view.kind !== "ok") return null;
    return view.actors.find((a) => a.slug === slug)?.actor_id ?? null;
  }, [view, slug]);

  const isOwner = useMemo(() => {
    if (view.kind !== "ok" || !myActorId) return false;
    return view.ch.channel.owner_actor_id === myActorId;
  }, [view, myActorId]);

  const slugByActor = useMemo(
    () => (view.kind === "ok" ? Object.fromEntries(view.actors.map((a) => [a.actor_id, a.slug])) : {}),
    [view],
  );

  const [posts, setPosts] = useState<StateObject[]>([]);
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    if (!channelId) return;
    setView({ kind: "loading" });
    setJoinErr(null);
    setMgmtErr(null);
    setInviteToken(null);
    try {
      const list = await client.listActors();
      const ch = await client.getChannel(channelId);
      setTitle(ch.channel.title);
      setView({ kind: "ok", ch, actors: list });

      try {
        setOwners(await client.listChannelMembers(channelId));
      } catch {
        setOwners(null);
      }

      const loaded: StateObject[] = [];
      const rem: Record<string, boolean> = {};
      for (const r of ch.refs) {
        const st = await client.getObject(r.post_object_id);
        loaded.push(st);
        const labs = (await client.listLabels({ target: r.post_object_id, channel_id: channelId })) as LabelRow[];
        if (labs.some((l) => l.label === "removed_from_channel")) rem[r.post_object_id] = true;
      }
      setPosts(loaded);
      setRemoved(rem);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("channel_forbidden:")) {
        setView({ kind: "forbidden" });
        return;
      }
      setView({ kind: "error", message: msg });
    }
  }, [channelId, client]);

  useEffect(() => {
    void load();
  }, [load, slug]);

  const submitRef = async () => {
    if (view.kind !== "ok" || !channelId || !refInput.trim()) return;
    setRefErr(null);
    try {
      const st = await client.getObject(refInput.trim());
      await client.submitChannelRef(channelId, st.object_id, st.actor_id);
      setRefInput("");
      await load();
    } catch (e) {
      setRefErr(String(e));
    }
  };

  const moderateRemove = async (postObjectId: string) => {
    if (!channelId) return;
    await client.applyLabel({
      target_object_id: postObjectId,
      label: "removed_from_channel",
      channel_id: channelId,
      notes: "Demo moderation — post hidden in channel view only",
    });
    await load();
  };

  const doJoin = async () => {
    if (!channelId || !joinToken.trim()) {
      setJoinErr("Paste the invite token.");
      return;
    }
    setJoinErr(null);
    try {
      await client.joinChannelWithToken(channelId, joinToken.trim());
      setJoinToken("");
      await load();
    } catch (e) {
      setJoinErr(String(e));
    }
  };

  const doAddMember = async () => {
    if (!channelId || !addSlug.trim() || !isOwner) return;
    setMgmtErr(null);
    try {
      await client.addChannelMember(channelId, addSlug.trim().toLowerCase());
      setAddSlug("");
      const m = await client.listChannelMembers(channelId);
      setOwners(m);
    } catch (e) {
      setMgmtErr(String(e));
    }
  };

  const doRemoveMember = async (actorId: string) => {
    if (!channelId || !isOwner) return;
    setMgmtErr(null);
    try {
      await client.removeChannelMember(channelId, actorId);
      const m = await client.listChannelMembers(channelId);
      setOwners(m);
    } catch (e) {
      setMgmtErr(String(e));
    }
  };

  const doInvite = async () => {
    if (!channelId || !isOwner) return;
    setMgmtErr(null);
    try {
      const inv = await client.createChannelInvite(channelId, { max_uses: 5 });
      setInviteToken(inv.token);
    } catch (e) {
      setMgmtErr(String(e));
    }
  };

  if (view.kind === "loading") {
    return (
      <div className="p-6 text-center text-twx-muted dark:text-twx-dark-muted" aria-live="polite">
        Loading…
      </div>
    );
  }

  if (view.kind === "forbidden" && channelId) {
    return (
      <div className="p-4">
        <header className="mb-4">
          <Link to="/channels" className="text-sm text-twx-blue hover:underline">
            ← Channels
          </Link>
        </header>
        <h1 className="text-xl font-bold">Private channel</h1>
        <p className="mt-2 text-sm text-twx-muted dark:text-twx-dark-muted">
          You need membership on this <strong>origin</strong> for <code className="text-xs">#{channelId.slice(0, 28)}…</code> as the current
          <strong> As </strong> user. Ask the owner for an invite token, then join below.
        </p>
        <div className="mt-4 max-w-md space-y-2">
          <input
            className="w-full rounded border border-twx-border bg-twx-raised px-3 py-2 font-mono text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
            value={joinToken}
            onChange={(e) => setJoinToken(e.target.value)}
            placeholder="Invite token (base64url)"
            autoComplete="off"
          />
          {joinErr ? <p className="text-sm text-rose-600 dark:text-rose-400">{joinErr}</p> : null}
          <button
            type="button"
            className="rounded-full bg-twx-blue px-4 py-2 text-sm font-bold text-white"
            onClick={() => void doJoin()}
          >
            Join with token
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="p-4">
        <Link to="/channels" className="text-sm text-twx-blue hover:underline">
          ← Channels
        </Link>
        <p className="mt-4 text-rose-600" role="alert">
          {view.message}
        </p>
      </div>
    );
  }

  if (view.kind !== "ok") return null;

  const { ch } = view;
  const isPrivate = ch.channel.visibility === "private";
  const welcome = ch.private_welcome_plaintext;

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-twx-border bg-twx-bg/80 px-2 py-2 backdrop-blur dark:border-twx-dark-border dark:bg-twx-dark-bg/80">
        <Link to="/channels" className="text-sm text-twx-blue hover:underline">
          ← Channels
        </Link>
        <h1 className="mt-1 text-xl font-bold">
          {isPrivate ? <span className="mr-2">🔒</span> : null}#{title || ch.channel.title}
        </h1>
        {ch.channel.description ? (
          <p className="text-sm text-twx-muted dark:text-twx-dark-muted">{ch.channel.description}</p>
        ) : null}
        <p className="text-sm text-twx-muted dark:text-twx-dark-muted">Refs and labels — not a delete on origin</p>
        {isPrivate && welcome ? (
          <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm text-twx-text dark:text-twx-dark-text">
            <span className="font-bold text-sky-700 dark:text-sky-300">Private note (server-decrypted in MVP)</span>
            <p className="mt-1 whitespace-pre-wrap">{welcome}</p>
          </div>
        ) : null}
        {channelId ? (
          <p className="mt-2">
            <Link
              className="text-sm font-bold text-twx-blue hover:underline"
              to={`/publisher?channel=${encodeURIComponent(channelId)}`}
            >
              Post from publisher with this channel
            </Link>
          </p>
        ) : null}
      </header>

      {isOwner && channelId ? (
        <div className="border-b border-twx-border p-3 dark:border-twx-dark-border">
          <h2 className="text-[15px] font-bold">You own this channel</h2>
          {mgmtErr ? <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{mgmtErr}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-twx-border px-3 py-1.5 text-sm font-bold dark:border-twx-dark-border"
              onClick={() => void doInvite()}
            >
              Create invite token
            </button>
            {inviteToken ? (
              <div className="w-full break-all rounded border border-slate-500/20 bg-slate-500/5 p-2 font-mono text-xs">
                {inviteToken}
                <button
                  type="button"
                  className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-slate-900 dark:bg-slate-600 dark:text-slate-100"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteToken);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Copy
                </button>
              </div>
            ) : null}
          </div>
          <div className="mt-3">
            <label className="text-xs text-twx-muted dark:text-twx-dark-muted" htmlFor="add-slug">
              Add member by slug
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                id="add-slug"
                className="min-w-0 flex-1 rounded border border-twx-border bg-twx-raised px-2 py-1.5 text-sm dark:border-twx-dark-border dark:bg-twx-dark-raised"
                value={addSlug}
                onChange={(e) => setAddSlug(e.target.value)}
                placeholder="bob"
              />
              <button type="button" className="rounded-full bg-twx-blue px-3 py-1.5 text-sm font-bold text-white" onClick={() => void doAddMember()}>
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {owners && (isOwner || myActorId) && channelId ? (
        <div className="border-b border-twx-border p-3 dark:border-twx-dark-border">
          <h2 className="text-[15px] font-bold">Members on this origin</h2>
          <ul className="mt-2 text-sm text-twx-text dark:text-twx-dark-text">
            <li>
              <strong>Owner</strong> @{owners.owner.slug}
            </li>
            {owners.members.length ? (
              owners.members.map((m) => (
                <li key={m.actor_id} className="mt-1 flex items-center justify-between gap-2">
                  <span>@{m.slug}</span>
                  {isOwner ? (
                    <button
                      type="button"
                      className="text-rose-600 text-xs font-bold hover:underline dark:text-rose-400"
                      onClick={() => void doRemoveMember(m.actor_id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-twx-muted">No extra members (owner may add some).</li>
            )}
          </ul>
        </div>
      ) : null}

      <div className="border-b border-twx-border p-3 dark:border-twx-dark-border">
        <h2 className="text-[15px] font-bold">Add a ref</h2>
        <p className="text-xs text-twx-muted dark:text-twx-dark-muted">Paste a post <code>object_id</code> (private channels: members only)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-twx-border bg-twx-raised/50 px-2 py-2 font-mono text-xs dark:border-twx-dark-border dark:bg-twx-dark-raised/50"
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            placeholder="post:…"
          />
          <button type="button" className="rounded-full bg-twx-blue px-3 py-1.5 text-sm font-bold text-white" onClick={() => void submitRef()}>
            Add
          </button>
        </div>
        {refErr ? <p className="mt-1 text-xs text-rose-600">{refErr}</p> : null}
      </div>
      <div>
        {posts.map((p) => (
          <div key={p.object_id} className="border-b border-twx-border/60 dark:border-twx-dark-border/60">
            <PostCard
              post={p}
              authorSlug={slugByActor[p.actor_id]}
              channelRemoved={removed[p.object_id]}
              onOpen={() => window.location.assign(`/post/${encodeURIComponent(p.actor_id)}/${encodeURIComponent(p.object_id)}`)}
            />
            {slug === "mod" && !removed[p.object_id] ? (
              <div className="px-4 pb-2 pl-[4.25rem]">
                <button
                  type="button"
                  className="text-sm font-bold text-rose-600 hover:underline dark:text-rose-400"
                  onClick={() => moderateRemove(p.object_id)}
                >
                  Remove from channel
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {posts.length === 0 ? <p className="p-6 text-center text-twx-muted">No refs yet</p> : null}
      </div>
    </div>
  );
}
