import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { StateObject } from "@relay-mvp/protocol";
import { PostCard } from "@relay-mvp/ui";
import { useDemoActor } from "../demoActor.js";

type LabelRow = { label: string; channel_id?: string | null };
type Summ = { like_count: number; reply_count: number; liked_by_me: boolean };

export function PostDetail() {
  const { actorId, objectId } = useParams<{ actorId: string; objectId: string }>();
  const { client, slug } = useDemoActor();
  const [myId, setMyId] = useState<string | null>(null);
  const [actors, setActors] = useState<Array<{ actor_id: string; slug: string }>>([]);
  const [main, setMain] = useState<StateObject | null>(null);
  const [thread, setThread] = useState<StateObject[]>([]);
  const [replies, setReplies] = useState<StateObject[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [engagement, setEngagement] = useState<Record<string, Summ>>({});
  const [err, setErr] = useState<string | null>(null);

  const slugByActor = useMemo(() => Object.fromEntries(actors.map((a) => [a.actor_id, a.slug])), [actors]);

  useEffect(() => {
    void client.listActors().then((a) => {
      setActors(a);
      setMyId(a.find((x) => x.slug === slug)?.actor_id ?? null);
    });
  }, [client, slug]);

  const reloadEngagement = useCallback(
    async (rootId: string, replyList: StateObject[]) => {
      const ids = [rootId, ...replyList.map((r) => r.object_id)];
      const summ = await client.getReactionSummary(ids);
      setEngagement(summ);
    },
    [client],
  );

  useEffect(() => {
    if (!actorId || !objectId) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await client.getState(actorId, objectId);
        if (cancelled) return;
        setMain(s);
        const labs = (await client.listLabels({ target: objectId })) as LabelRow[];
        setLabels(labs.map((l) => l.label));
        const chain: StateObject[] = [];
        let cur: StateObject | undefined = s;
        const guard = new Set<string>();
        while (cur?.payload && typeof cur.payload === "object" && "reply_to" in cur.payload && cur.payload.reply_to) {
          const pid = cur.payload.reply_to as string;
          if (guard.has(pid)) break;
          guard.add(pid);
          const parent = await client.getObject(pid);
          chain.push(parent);
          cur = parent;
        }
        setThread(chain);
        const reps = await client.getReplies(objectId);
        if (cancelled) return;
        setReplies(reps);
        await reloadEngagement(objectId, reps);
      } catch (e) {
        setErr(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actorId, objectId, client, reloadEngagement]);

  const toggleLike = async (targetId: string) => {
    if (!myId) return;
    const cur = engagement[targetId];
    const action = cur?.liked_by_me ? "remove" : "add";
    const out = await client.toggleReaction(myId, { target_object_id: targetId, action });
    setEngagement((e) => ({
      ...e,
      [targetId]: {
        like_count: out.like_count,
        reply_count: e[targetId]?.reply_count ?? 0,
        liked_by_me: out.liked_by_me,
      },
    }));
  };

  if (err) return <p className="p-4 text-rose-600">{err}</p>;
  if (!main) return <p className="p-4 text-twx-muted">Loading…</p>;

  const summ = (id: string): Summ => engagement[id] ?? { like_count: 0, reply_count: 0, liked_by_me: false };

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-twx-border bg-twx-bg/80 px-2 py-2 backdrop-blur dark:border-twx-dark-border dark:bg-twx-dark-bg/80">
        <Link
          to="/reader"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-twx-text hover:bg-slate-500/10 dark:text-twx-dark-text"
          aria-label="Back"
        >
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold leading-tight">Thread</h1>
          <p className="text-xs text-twx-muted dark:text-twx-dark-muted">Replies and ancestors</p>
        </div>
      </div>

      <div className="border-b-8 border-twx-border/60 dark:border-twx-dark-border/60" />

      <div>
        {[...thread].reverse().map((p) => (
          <PostCard
            key={p.object_id}
            post={p}
            authorSlug={slugByActor[p.actor_id]}
            onOpen={() => window.location.assign(`/post/${encodeURIComponent(p.actor_id)}/${encodeURIComponent(p.object_id)}`)}
          />
        ))}
        <PostCard
          post={main}
          authorSlug={slugByActor[main.actor_id]}
          labels={labels}
          engagement={{
            likeCount: summ(main.object_id).like_count,
            replyCount: summ(main.object_id).reply_count,
            likedByMe: summ(main.object_id).liked_by_me,
          }}
          onToggleLike={myId ? () => void toggleLike(main.object_id) : undefined}
          replyComposerHref={`/publisher?reply_to=${encodeURIComponent(main.object_id)}`}
        />

        {replies.length > 0 ? (
          <div className="border-b-8 border-twx-border/60 px-2 py-1 text-sm font-bold dark:border-twx-dark-border/60">Comments</div>
        ) : null}
        {replies.length === 0 ? (
          <p className="p-4 text-center text-sm text-twx-muted dark:text-twx-dark-muted">No comments yet. Reply to join.</p>
        ) : (
          replies.map((p) => (
            <PostCard
              key={p.object_id}
              post={p}
              authorSlug={slugByActor[p.actor_id]}
              engagement={{
                likeCount: summ(p.object_id).like_count,
                replyCount: summ(p.object_id).reply_count,
                likedByMe: summ(p.object_id).liked_by_me,
              }}
              onToggleLike={myId ? () => void toggleLike(p.object_id) : undefined}
              replyComposerHref={`/publisher?reply_to=${encodeURIComponent(p.object_id)}`}
              onOpen={() => window.location.assign(`/post/${encodeURIComponent(p.actor_id)}/${encodeURIComponent(p.object_id)}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}
