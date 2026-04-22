import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDemoActor } from "../demoActor.js";

export function ChannelsList() {
  const { client } = useDemoActor();
  const [ch, setCh] = useState<Array<{ channel_id: string; title: string; owner_actor_id: string }>>([]);

  useEffect(() => {
    void client.listChannels().then(setCh);
  }, [client]);

  return (
    <div>
      <header className="border-b border-twx-border p-3 dark:border-twx-dark-border">
        <h1 className="text-xl font-extrabold">Channels</h1>
        <p className="text-sm text-twx-muted dark:text-twx-dark-muted">Aggregation and overlays — not separate copies of posts</p>
      </header>
      <ul className="divide-y divide-twx-border dark:divide-twx-dark-border">
        {ch.map((c) => (
          <li key={c.channel_id} className="hover:bg-twx-raised/50 dark:hover:bg-twx-dark-raised/30">
            <Link
              to={`/channel/${encodeURIComponent(c.channel_id)}`}
              className="flex items-center justify-between gap-2 px-4 py-3 text-[15px] no-underline"
            >
              <span>
                <span className="font-bold text-twx-text dark:text-twx-dark-text">#{c.title}</span>
                <span className="ml-1 font-mono text-xs text-twx-muted/90 dark:text-twx-dark-muted/90">{c.channel_id.slice(0, 20)}…</span>
              </span>
              <span className="text-twx-muted" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
