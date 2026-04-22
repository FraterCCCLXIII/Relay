import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDemoActor } from "../demoActor.js";

type Row = {
  channel_id: string;
  title: string;
  owner_actor_id: string;
  description?: string | null;
  visibility?: string;
};

export function ChannelsList() {
  const { client, slug } = useDemoActor();
  const [ch, setCh] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [welcome, setWelcome] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setErr(null);
    void client.listChannels().then(setCh).catch((e) => setErr(String(e)));
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh, slug]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const body: Parameters<typeof client.createChannel>[0] = {
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
      };
      if (visibility === "private" && welcome.trim()) {
        body.welcome_plaintext = welcome.trim();
      }
      const { channel } = await client.createChannel(body);
      setTitle("");
      setDescription("");
      setWelcome("");
      setVisibility("public");
      await refresh();
      window.location.assign(`/channel/${encodeURIComponent(channel.channel_id)}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setCreating(false);
    }
  };

  const join = async () => {
    if (!joinId.trim() || !joinToken.trim()) {
      setJoinMsg("Channel id and token are required.");
      return;
    }
    const chId = joinId.trim();
    const token = joinToken.trim();
    setJoining(true);
    setJoinMsg(null);
    try {
      await client.joinChannelWithToken(chId, token);
      setJoinMsg("Joined. Opening channel…");
      setJoinId("");
      setJoinToken("");
      await refresh();
      setTimeout(() => {
        window.location.assign(`/channel/${encodeURIComponent(chId)}`);
      }, 200);
    } catch (e) {
      setJoinMsg(String(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div>
      <header className="border-b border-twx-border p-3 dark:border-twx-dark-border">
        <h1 className="text-xl font-extrabold">Channels</h1>
        <p className="text-sm text-twx-muted dark:text-twx-dark-muted">Aggregation and overlays — not separate copies of posts</p>
      </header>

      <section className="border-b border-twx-border p-4 dark:border-twx-dark-border" aria-labelledby="join-heading">
        <h2 id="join-heading" className="text-[15px] font-bold text-twx-text dark:text-twx-dark-text">
          Join a private channel
        </h2>
        <p className="mt-1 text-xs text-twx-muted dark:text-twx-dark-muted">
          You must be the intended demo user (header <strong>As</strong> →) on this server. Paste the invite <strong>token</strong> the owner
          created.
        </p>
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-twx-muted dark:text-twx-dark-muted" htmlFor="join-ch-id">
            Channel id
          </label>
          <input
            id="join-ch-id"
            className="w-full rounded border border-twx-border bg-twx-raised px-3 py-2 font-mono text-xs text-twx-text dark:border-twx-dark-border dark:bg-twx-dark-raised dark:text-twx-dark-text"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="relay:channel:…"
            autoComplete="off"
          />
          <label className="block text-xs font-medium text-twx-muted dark:text-twx-dark-muted" htmlFor="join-token">
            Invite token
          </label>
          <input
            id="join-token"
            className="w-full rounded border border-twx-border bg-twx-raised px-3 py-2 font-mono text-xs text-twx-text dark:border-twx-dark-border dark:bg-twx-dark-raised dark:text-twx-dark-text"
            value={joinToken}
            onChange={(e) => setJoinToken(e.target.value)}
            placeholder="From owner → invite"
            autoComplete="off"
          />
          <button
            type="button"
            className="rounded-full bg-slate-600 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 dark:bg-slate-500"
            disabled={joining}
            onClick={() => void join()}
          >
            {joining ? "Joining…" : "Join"}
          </button>
        </div>
        {joinMsg ? (
          <p className="mt-2 text-sm text-twx-text dark:text-twx-dark-text" role="status">
            {joinMsg}
          </p>
        ) : null}
      </section>

      <section className="border-b border-twx-border p-4 dark:border-twx-dark-border" id="create" aria-labelledby="create-heading">
        <h2 id="create-heading" className="text-[15px] font-bold text-twx-text dark:text-twx-dark-text">
          Create a channel
        </h2>
        <p className="mt-1 text-xs text-twx-muted dark:text-twx-dark-muted">You are the owner as the current <strong>As</strong> user.</p>
        <div className="mt-3 max-w-md space-y-2">
          <input
            className="w-full rounded border border-twx-border bg-twx-raised px-3 py-2 text-sm text-twx-text dark:border-twx-dark-border dark:bg-twx-dark-raised dark:text-twx-dark-text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            aria-label="Channel title"
          />
          <textarea
            className="w-full rounded border border-twx-border bg-twx-raised px-3 py-2 text-sm text-twx-text dark:border-twx-dark-border dark:bg-twx-dark-raised dark:text-twx-dark-text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            aria-label="Channel description"
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-twx-text dark:text-twx-dark-text">
              <input
                type="radio"
                name="vis"
                checked={visibility === "public"}
                onChange={() => setVisibility("public")}
              />
              Public
            </label>
            <label className="flex items-center gap-2 text-sm text-twx-text dark:text-twx-dark-text">
              <input
                type="radio"
                name="vis"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
              />
              Private
            </label>
          </div>
          {visibility === "private" ? (
            <textarea
              className="w-full rounded border border-twx-border bg-twx-raised px-3 py-2 text-sm text-twx-text dark:border-twx-dark-border dark:bg-twx-dark-raised dark:text-twx-dark-text"
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              placeholder="Encrypted welcome note (server-side AES, optional)"
              rows={2}
              aria-label="Private welcome"
            />
          ) : null}
          <div>
            <button
              type="button"
              className="rounded-full bg-twx-blue px-4 py-2 text-sm font-bold text-white hover:bg-twx-blue-hover"
              disabled={creating}
              onClick={() => void create()}
            >
              {creating ? "Creating…" : "Create channel"}
            </button>
          </div>
        </div>
      </section>

      {err ? (
        <p className="border-b border-rose-500/20 bg-rose-500/5 px-4 py-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
          {err}
        </p>
      ) : null}

      <ul className="divide-y divide-twx-border dark:divide-twx-dark-border" aria-label="Channel list">
        {ch.map((c) => {
          const isPrivate = c.visibility === "private";
          return (
            <li key={c.channel_id} className="hover:bg-twx-raised/50 dark:hover:bg-twx-dark-raised/30">
              <Link
                to={`/channel/${encodeURIComponent(c.channel_id)}`}
                className="flex items-center justify-between gap-2 px-4 py-3 text-[15px] no-underline"
              >
                <span>
                  {isPrivate ? (
                    <span className="mr-1.5 inline-flex rounded bg-slate-200 px-1.5 text-xs font-bold text-slate-800 dark:bg-slate-600 dark:text-slate-100" title="Private channel">
                      🔒
                    </span>
                  ) : null}
                  <span className="font-bold text-twx-text dark:text-twx-dark-text">#{c.title}</span>
                  <span className="ml-1 font-mono text-xs text-twx-muted/90 dark:text-twx-dark-muted/90">
                    {c.channel_id.slice(0, 20)}…
                  </span>
                </span>
                <span className="text-twx-muted" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
