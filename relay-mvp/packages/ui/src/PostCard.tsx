import type { StateObject } from "@relay-mvp/protocol";
import type { MouseEvent, ReactNode } from "react";

export type PostEngagement = {
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
};

function initialFromId(actorId: string, slug?: string) {
  if (slug) return slug.slice(0, 1).toUpperCase();
  return (actorId.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
}

function atHandle(authorSlug: string | undefined, actorId: string) {
  if (authorSlug) return authorSlug;
  const short = actorId.replace(/^(actor:|post:)/, "").slice(0, 8);
  return short || "user";
}

function formatPostTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric" });
}

/* chat-bubble for reply */
function IconChat() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 4v-4z"
      />
    </svg>
  );
}

function IconHeart({ filled }: { filled: boolean }) {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 0 0 0 6.364L12 20.364l7.682-7.682a4.5 4.5 0 0 0-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 0 0-6.364 0z"
      />
    </svg>
  );
}

function IconRepost() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1M12 3v10m-3-3 3-3m0 0 3 3" />
    </svg>
  );
}

export function PostCard(props: {
  post: StateObject;
  /** @handle; falls back to shortened id */
  authorSlug?: string;
  /** Bold name; defaults to authorSlug or short id */
  displayName?: string;
  onOpen?: () => void;
  channelRemoved?: boolean;
  labels?: string[];
  engagement?: PostEngagement;
  onToggleLike?: () => void;
  replyComposerHref?: string;
  footerExtra?: ReactNode;
  /** Show object id + version (dev) */
  showDevMeta?: boolean;
}) {
  const p = props.post.payload as { title?: string; body?: string };
  const tomb = props.post.deleted;
  const hasEngagement =
    props.engagement != null || props.onToggleLike != null || props.replyComposerHref != null || props.footerExtra != null;

  const stop = (e: MouseEvent) => e.stopPropagation();
  const handle = atHandle(props.authorSlug, props.post.actor_id);
  const time = formatPostTime(props.post.updated_at ?? props.post.created_at);
  const initial = initialFromId(props.post.actor_id, props.authorSlug);
  const display = props.displayName ?? props.authorSlug ?? handle;

  const onMainClick = () => {
    if (props.onOpen) props.onOpen();
  };

  const actBase =
    "group flex min-h-[2.15rem] min-w-[2.15rem] items-center justify-center gap-1.5 rounded-full p-1.5 text-sm text-twx-muted transition-colors dark:text-twx-dark-muted";
  const actHover = "hover:bg-sky-500/10 hover:text-twx-blue";
  const likeHover = "hover:bg-rose-500/10";
  const likeOn = "text-twx-like-on";

  return (
    <article
      className="cursor-default border-b border-twx-border transition-colors dark:border-twx-dark-border"
      onClick={hasEngagement ? undefined : onMainClick}
      onKeyDown={
        !hasEngagement && props.onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onOpen?.();
              }
            }
          : undefined
      }
      role={!hasEngagement && props.onOpen ? "button" : undefined}
      tabIndex={!hasEngagement && props.onOpen ? 0 : undefined}
    >
      <div
        className={`flex gap-3 px-4 py-3 ${props.onOpen ? "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]" : ""}`}
        onClick={hasEngagement ? onMainClick : undefined}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-cyan-600 text-sm font-bold text-white ring-1 ring-black/5 dark:ring-white/10"
          aria-hidden
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-feed leading-5">
            <span className="font-bold text-twx-text dark:text-twx-dark-text">{display}</span>
            <span className="text-[15px] text-twx-muted dark:text-twx-dark-muted">
              @{handle}
              {time ? <span className="text-twx-muted/80"> · {time}</span> : null}
            </span>
          </div>
          {props.labels && props.labels.length > 0 ? (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {props.labels.map((l) => (
                <span
                  key={l}
                  className="rounded border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200"
                >
                  {l}
                </span>
              ))}
            </div>
          ) : null}
          {props.channelRemoved ? (
            <p className="mt-1 text-sm font-medium text-rose-600 dark:text-rose-400">Hidden in this channel</p>
          ) : null}
          {tomb ? (
            <p className="mt-1 text-[15px] text-twx-muted italic dark:text-twx-dark-muted">This post was deleted.</p>
          ) : (
            <div className="mt-1 text-feed text-twx-text dark:text-twx-dark-text">
              {p.title ? <p className="font-bold">{p.title}</p> : null}
              {p.body ? <p className="mt-0.5 whitespace-pre-wrap break-words">{p.body}</p> : !p.title ? <p className="text-twx-muted">(empty)</p> : null}
            </div>
          )}
          {props.showDevMeta ? (
            <p className="mt-1 font-mono text-[11px] text-twx-muted/70 dark:text-twx-dark-muted/80">v{props.post.version} · {props.post.object_id}</p>
          ) : null}
        </div>
      </div>

      {hasEngagement ? (
        <div
          className="grid max-w-md grid-cols-4 items-center gap-0.5 px-4 pb-2.5 pl-[4.25rem] text-twx-muted dark:text-twx-dark-muted"
          onClick={stop}
        >
          <div className="flex items-center justify-start">
            {props.replyComposerHref && !tomb ? (
              <a
                className={`-m-1.5 ${actBase} ${actHover} no-underline`}
                href={props.replyComposerHref}
                title="Reply"
                aria-label="Reply"
              >
                <span className="inline-flex items-center gap-1">
                  <IconChat />
                  {props.engagement && props.engagement.replyCount > 0 ? (
                    <span className="text-[13px] tabular-nums text-twx-muted dark:text-twx-dark-muted">{props.engagement.replyCount}</span>
                  ) : null}
                </span>
              </a>
            ) : (
              <span className={`-m-1.5 ${actBase} cursor-default opacity-40`} title="Reply">
                <span className="inline-flex items-center gap-1">
                  <IconChat />
                  {props.engagement && props.engagement.replyCount > 0 ? (
                    <span className="text-[13px] tabular-nums">{props.engagement.replyCount}</span>
                  ) : null}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center justify-center">
            <span className={`${actBase} cursor-default opacity-30`} title="Repost (not in MVP)">
              <IconRepost />
            </span>
          </div>
          <div className="flex items-center justify-center">
            {props.engagement && !tomb ? (
              props.onToggleLike ? (
                <button
                  type="button"
                  className={`-m-1.5 ${actBase} ${likeHover} ${props.engagement.likedByMe ? likeOn : ""}`}
                  onClick={props.onToggleLike}
                  aria-pressed={props.engagement.likedByMe}
                  aria-label={props.engagement.likedByMe ? "Unlike" : "Like"}
                >
                  <span className="inline-flex items-center gap-1">
                    <IconHeart filled={props.engagement.likedByMe} />
                    {props.engagement.likeCount > 0 ? (
                      <span className="text-[13px] tabular-nums text-current">{props.engagement.likeCount}</span>
                    ) : null}
                  </span>
                </button>
              ) : (
                <span className={`-m-1.5 ${actBase} cursor-default opacity-80`} aria-label="Likes">
                  <span className="inline-flex items-center gap-1">
                    <IconHeart filled={false} />
                    {props.engagement.likeCount > 0 ? <span className="text-[13px] tabular-nums">{props.engagement.likeCount}</span> : null}
                  </span>
                </span>
              )
            ) : null}
          </div>
          <div className="flex items-center justify-end">
            {props.onOpen && !tomb ? (
              <button
                type="button"
                className={`-m-1.5 ${actBase} ${actHover}`}
                onClick={props.onOpen}
                title="Open thread"
                aria-label="Open thread"
              >
                <IconShare />
              </button>
            ) : (
              <span className={`-m-1.5 ${actBase} cursor-default opacity-30`} aria-hidden>
                <IconShare />
              </span>
            )}
          </div>
          {props.footerExtra ? <div className="col-span-4 flex flex-wrap gap-2">{props.footerExtra}</div> : null}
        </div>
      ) : null}
    </article>
  );
}
