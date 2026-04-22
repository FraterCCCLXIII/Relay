import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { StateObject } from "@relay-mvp/protocol";
import { PostCard } from "@relay-mvp/ui";
import { useDemoActor } from "../demoActor.js";
import { useRelay } from "../useRelay.js";

type LabelRow = { target_object_id: string; label: string; channel_id?: string | null };
type Summ = { like_count: number; reply_count: number; liked_by_me: boolean };

export function ReaderHome() {
  const { client, slug } = useDemoActor();
  const [actors, setActors] = useState<Array<{ actor_id: string; slug: string }>>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [posts, setPosts] = useState<StateObject[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [labelsByPost, setLabelsByPost] = useState<Record<string, string[]>>({});
  const [engagement, setEngagement] = useState<Record<string, Summ>>({});
  const [relayPaused, setRelayPaused] = useState(false);
  const [sourceNote, setSourceNote] = useState<string>("");

  const slugByActor = useMemo(() => Object.fromEntries(actors.map((a) => [a.actor_id, a.slug])), [actors]);

  const load = useCallback(async () => {
    const list = await client.listActors();
    setActors(list);
    const me = list.find((a) => a.slug === slug)?.actor_id ?? null;
    setMyId(me);
    if (!me) return;
    const feed = await client.homeFeed();
    setPosts(feed.posts);
    setFollowing(feed.following);
    const f = await client.following(me);
    setFollowing(f);
    setSourceNote(`feeds: origin · follow network (${f.length})`);

    const labelMap: Record<string, string[]> = {};
    await Promise.all(
      feed.posts.map(async (p) => {
        const labs = (await client.listLabels({ target: p.object_id })) as LabelRow[];
        labelMap[p.object_id] = labs.map((l) => l.label);
      }),
    );
    setLabelsByPost(labelMap);

    const summ = await client.getReactionSummary(feed.posts.map((p) => p.object_id));
    setEngagement(summ);
  }, [client, slug]);

  const toggleLike = async (postId: string) => {
    if (!myId) return;
    const cur = engagement[postId];
    const action = cur?.liked_by_me ? "remove" : "add";
    const out = await client.toggleReaction(myId, { target_object_id: postId, action });
    setEngagement((e) => ({
      ...e,
      [postId]: {
        like_count: out.like_count,
        reply_count: e[postId]?.reply_count ?? 0,
        liked_by_me: out.liked_by_me,
      },
    }));
  };

  useEffect(() => {
    void load();
  }, [load]);

  const { connected, lastEvent, setRefresh, disconnectRelay, reconnectRelay } = useRelay(myId, !relayPaused, {
    actorSlug: slug,
  });

  useEffect(() => {
    setRefresh(load);
  }, [setRefresh, load]);

  const follow = async (aid: string) => {
    if (!myId) return;
    await client.follow(myId, aid);
    await load();
  };

  const unfollow = async (aid: string) => {
    if (!myId) return;
    await client.unfollow(myId, aid);
    await load();
  };

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-twx-border bg-twx-bg/80 px-4 py-3 backdrop-blur-md dark:border-twx-dark-border dark:bg-twx-dark-bg/80">
        <h1 className="text-xl font-bold">Home</h1>
        <p className="text-[13px] text-twx-muted dark:text-twx-dark-muted">{sourceNote}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-twx-muted dark:text-twx-dark-muted">
          <span
            className={
              connected
                ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-800 dark:text-emerald-200"
                : "rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-800 dark:text-rose-200"
            }
          >
            {connected ? "Live" : "HTTP only"}
          </span>
          {lastEvent ? <span className="max-w-xs truncate">WS {lastEvent.envelope_kind}</span> : null}
          <button
            type="button"
            className="rounded border border-twx-border px-1.5 py-0.5 dark:border-twx-dark-border"
            onClick={() => setRelayPaused((p) => !p)}
          >
            {relayPaused ? "Resume relay" : "Pause relay"}
          </button>
          {relayPaused ? (
            <button type="button" className="text-twx-blue" onClick={() => reconnectRelay()}>
              Reconnect
            </button>
          ) : (
            <button type="button" className="text-twx-muted" onClick={() => disconnectRelay()}>
              Drop WS
            </button>
          )}
        </div>
      </header>

      <div className="border-b border-twx-border p-3 dark:border-twx-dark-border">
        <Link
          to="/publisher"
          className="flex gap-3 rounded-2xl border border-transparent p-1 transition hover:bg-twx-raised/80 dark:hover:bg-twx-dark-raised/80"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-cyan-600 text-sm font-bold text-white">
            {(slug[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex min-h-10 min-w-0 flex-1 items-center pl-0.5 text-twx-muted">What is happening?!</div>
        </Link>
        <div className="mt-1 flex justify-end">
          <Link
            to="/publisher"
            className="inline-block rounded-full bg-twx-blue px-3 py-1.5 text-[15px] font-bold text-white hover:bg-twx-blue-hover"
          >
            Post
          </Link>
        </div>
      </div>

      <div className="border-b border-twx-border p-3 dark:border-twx-dark-border">
        <h2 className="text-[15px] font-bold">Who to follow</h2>
        <ul className="mt-2 space-y-1.5 text-[15px]">
          {actors
            .filter((a) => a.actor_id !== myId)
            .map((a) => (
              <li key={a.actor_id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link className="font-bold text-twx-text hover:underline dark:text-twx-dark-text" to={`/actor/${encodeURIComponent(a.actor_id)}`}>
                    {a.slug}
                  </Link>
                </div>
                {following.includes(a.actor_id) ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-twx-border px-3 py-1 text-sm font-bold dark:border-twx-dark-border"
                    onClick={() => void unfollow(a.actor_id)}
                  >
                    Following
                  </button>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-twx-text px-3 py-1 text-sm font-bold text-white dark:bg-twx-dark-text"
                    onClick={() => void follow(a.actor_id)}
                  >
                    Follow
                  </button>
                )}
              </li>
            ))}
        </ul>
      </div>

      <div>
        {posts.map((p) => {
          const s = engagement[p.object_id] ?? { like_count: 0, reply_count: 0, liked_by_me: false };
          return (
            <PostCard
              key={p.object_id}
              post={p}
              authorSlug={slugByActor[p.actor_id]}
              labels={labelsByPost[p.object_id]}
              engagement={{
                likeCount: s.like_count,
                replyCount: s.reply_count,
                likedByMe: s.liked_by_me,
              }}
              onToggleLike={myId && !p.deleted ? () => void toggleLike(p.object_id) : undefined}
              replyComposerHref={`/publisher?reply_to=${encodeURIComponent(p.object_id)}`}
              onOpen={() => window.location.assign(`/post/${encodeURIComponent(p.actor_id)}/${encodeURIComponent(p.object_id)}`)}
            />
          );
        })}
        {posts.length === 0 ? (
          <p className="p-6 text-center text-twx-muted dark:text-twx-dark-muted">No posts yet. Follow someone or publish a post.</p>
        ) : null}
      </div>

      <details className="border-t border-twx-border p-3 text-sm text-twx-muted dark:border-twx-dark-border dark:text-twx-dark-muted">
        <summary className="cursor-pointer text-[15px] font-bold text-twx-text/80 dark:text-twx-dark-text/80">How this works</summary>
        <p className="mt-2 text-[14px] leading-relaxed">
          Timeline from origin <code className="rounded bg-twx-raised px-0.5 dark:bg-twx-dark-raised">feed/home</code>. Labels from{" "}
          <code className="rounded bg-twx-raised px-0.5 dark:bg-twx-dark-raised">/labels</code>. Likes:{" "}
          <code className="rounded bg-twx-raised px-0.5 dark:bg-twx-dark-raised">reaction.add</code> /{" "}
          <code className="rounded bg-twx-raised px-0.5 dark:bg-twx-dark-raised">remove</code> + summary. Reply opens composer with{" "}
          <code className="rounded bg-twx-raised px-0.5 dark:bg-twx-dark-raised">reply_to</code>.
        </p>
      </details>
    </div>
  );
}
