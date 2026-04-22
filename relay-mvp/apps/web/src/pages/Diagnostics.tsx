import { useEffect, useState } from "react";
import { IndexerClient } from "@relay-mvp/sdk";
import { INDEXER_URL, ORIGIN_URL, RELAY_WS } from "../config.js";
import { useDemoActor } from "../demoActor.js";

export function Diagnostics() {
  const { client, slug } = useDemoActor();
  const [origin, setOrigin] = useState<string>("…");
  const [relay, setRelay] = useState<string>("…");
  const [indexer, setIndexer] = useState<string>("…");
  const [policy, setPolicy] = useState<unknown>(null);
  const [sources, setSources] = useState<unknown>(null);
  const [explain, setExplain] = useState<unknown>(null);
  const [myActor, setMyActor] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${ORIGIN_URL}/health`);
        setOrigin(r.ok ? "ok" : `error ${r.status}`);
      } catch {
        setOrigin("unreachable");
      }
      try {
        const u = new URL(RELAY_WS);
        const http = `http://${u.host}/health`;
        const r = await fetch(http);
        setRelay(r.ok ? "ok" : `error ${r.status}`);
      } catch {
        setRelay("unreachable");
      }
      try {
        const r = await fetch(`${INDEXER_URL}/health`);
        setIndexer(r.ok ? "ok" : `error ${r.status}`);
      } catch {
        setIndexer("unreachable");
      }
      const ic = new IndexerClient(INDEXER_URL);
      setPolicy(await ic.getPolicy());
      const actors = await client.listActors();
      const me = actors.find((a) => a.slug === slug)?.actor_id ?? null;
      setMyActor(me);
      if (me) setSources(await ic.getSources(me));
      setExplain(await ic.explain());
    })();
  }, [client, slug]);

  return (
    <div className="space-y-5 p-2 font-mono text-sm text-twx-text dark:text-twx-dark-text">
      <h1 className="border-b border-twx-border pb-2 font-sans text-xl font-bold dark:border-twx-dark-border">System</h1>
      <section className="space-y-1.5 text-[13px]">
        <div>
          <strong>Origin</strong> {ORIGIN_URL} — {origin}
        </div>
        <div>
          <strong>Relay</strong> {RELAY_WS} — {relay}
        </div>
        <div>
          <strong>Indexer</strong> {INDEXER_URL} — {indexer}
        </div>
        <div>
          <strong>Your actor</strong> ({slug}): {myActor ?? "…"}
        </div>
      </section>
      <section>
        <h2 className="font-sans text-sm font-bold">Indexer (§17.9)</h2>
        <pre className="mt-2 max-h-64 overflow-auto rounded-2xl border border-twx-border bg-twx-raised/80 p-3 text-xs dark:border-twx-dark-border dark:bg-twx-dark-raised/80">
          {JSON.stringify(policy, null, 2)}
        </pre>
        <h3 className="mt-3 font-sans text-sm font-bold">Sources</h3>
        <pre className="mt-1 max-h-48 overflow-auto rounded-2xl border border-twx-border bg-twx-raised/80 p-3 text-xs dark:border-twx-dark-border dark:bg-twx-dark-raised/80">
          {JSON.stringify(sources, null, 2)}
        </pre>
        <h3 className="mt-3 font-sans text-sm font-bold">Explain</h3>
        <pre className="mt-1 overflow-auto rounded-2xl border border-twx-border bg-twx-raised/80 p-3 text-xs dark:border-twx-dark-border dark:bg-twx-dark-raised/80">
          {JSON.stringify(explain, null, 2)}
        </pre>
      </section>
      <p className="font-sans text-sm text-twx-muted dark:text-twx-dark-muted">
        Relay is best-effort acceleration. The reader still works via <code>feed/home</code> and <code>snapshots/latest</code> over HTTP.
      </p>
    </div>
  );
}
