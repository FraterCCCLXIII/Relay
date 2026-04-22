import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { IdentityDocument, StateObject } from "@relay-mvp/protocol";
import { PostCard } from "@relay-mvp/ui";
import { useDemoActor } from "../demoActor.js";

export function ActorPage() {
  const { actorId } = useParams<{ actorId: string }>();
  const { client } = useDemoActor();
  const [id, setId] = useState<IdentityDocument | null>(null);
  const [posts, setPosts] = useState<StateObject[]>([]);
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!actorId) return;
    void (async () => {
      const actors = await client.listActors();
      setSlug(actors.find((a) => a.actor_id === actorId)?.slug ?? null);
      const i = await client.getIdentity(actorId);
      setId(i);
      setPosts(await client.listPosts(actorId));
    })();
  }, [actorId, client]);

  if (!actorId) return null;

  return (
    <div>
      <div className="h-20 w-full bg-gradient-to-r from-sky-500/30 via-cyan-500/20 to-sky-600/30 dark:from-sky-900/40 dark:via-cyan-900/20 dark:to-sky-800/30" />
      <div className="relative -mt-8 px-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-twx-bg bg-gradient-to-br from-sky-400 to-cyan-600 text-2xl font-bold text-white dark:border-twx-dark-bg">
          {(slug?.[0] ?? id?.actor_id[0] ?? "?").toUpperCase()}
        </div>
        <div className="mt-2">
          {id ? (
            <>
              <h1 className="text-xl font-extrabold text-twx-text dark:text-twx-dark-text">{id.display_name ?? slug ?? "Actor"}</h1>
              {slug ? <p className="text-[15px] text-twx-muted dark:text-twx-dark-muted">@{slug}</p> : null}
              {id.bio ? <p className="mt-2 text-[15px] text-twx-text/90 dark:text-twx-dark-text/90">{id.bio}</p> : null}
              <p className="mt-2 font-mono text-xs text-twx-muted/80 dark:text-twx-dark-muted/80">{id.actor_id}</p>
            </>
          ) : (
            <p className="text-twx-muted">Loading…</p>
          )}
        </div>
        <p className="mt-2 rounded-2xl bg-twx-raised/90 px-3 py-2 text-sm text-twx-muted dark:bg-twx-dark-raised/90 dark:text-twx-dark-muted">
          Identity and keys are a demo unless you add §6 verification.
        </p>
      </div>
      <div className="mt-2 border-b border-twx-border dark:border-twx-dark-border" />
      <div>
        {posts.map((p) => (
          <PostCard
            key={p.object_id}
            post={p}
            authorSlug={slug ?? undefined}
            displayName={id?.display_name}
            onOpen={() => window.location.assign(`/post/${encodeURIComponent(p.actor_id)}/${encodeURIComponent(p.object_id)}`)}
          />
        ))}
        {posts.length === 0 ? (
          <p className="p-6 text-center text-twx-muted dark:text-twx-dark-muted">No posts on this author feed yet.</p>
        ) : null}
      </div>
      <p className="p-3 text-center text-sm">
        <Link to="/reader" className="text-twx-blue hover:underline">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
