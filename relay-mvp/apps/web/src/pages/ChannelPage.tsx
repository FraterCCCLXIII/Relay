import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { StateObject } from "@relay-mvp/protocol";
import { PostCard } from "@relay-mvp/ui";
import { useDemoActor } from "../demoActor.js";

type LabelRow = { label: string; channel_id?: string | null };

export function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const { client, slug } = useDemoActor();
  const [title, setTitle] = useState("");
  const [actors, setActors] = useState<Array<{ actor_id: string; slug: string }>>([]);
  const [posts, setPosts] = useState<StateObject[]>([]);
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [refInput, setRefInput] = useState("");
  const [refErr, setRefErr] = useState<string | null>(null);

  const slugByActor = useMemo(() => Object.fromEntries(actors.map((a) => [a.actor_id, a.slug])), [actors]);

  const load = async () => {
    if (!channelId) return;
    const list = await client.listActors();
    setActors(list);
    const ch = await client.getChannel(channelId);
    setTitle(ch.channel.title);
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
  };

  useEffect(() => {
    void load();
  }, [channelId, client]);

  const submitRef = async () => {
    if (!channelId || !refInput.trim()) return;
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

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-twx-border bg-twx-bg/80 px-2 py-2 backdrop-blur dark:border-twx-dark-border dark:bg-twx-dark-bg/80">
        <Link
          to="/channels"
          className="text-sm text-twx-blue hover:underline"
        >
          ← Channels
        </Link>
        <h1 className="mt-1 text-xl font-bold">#{title || "channel"}</h1>
        <p className="text-sm text-twx-muted dark:text-twx-dark-muted">Refs and labels — not a delete on origin</p>
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
      <div className="border-b border-twx-border p-3 dark:border-twx-dark-border">
        <h2 className="text-[15px] font-bold">Add a ref</h2>
        <p className="text-xs text-twx-muted dark:text-twx-dark-muted">Paste a post <code>object_id</code></p>
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
