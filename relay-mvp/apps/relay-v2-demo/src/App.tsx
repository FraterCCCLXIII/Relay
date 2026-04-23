import { useCallback, useMemo, useState } from "react";
import {
  boundaryCanonicalString,
  createIdentity,
  signEvent,
  signState,
  type BoundaryV2,
  type FeedDefinitionStateV1,
  type RelayEventV1,
  type RelayStateV1
} from "@relay-mvp/relay";
import { MemoryStorage, ReferenceRuntime } from "@relay-mvp/reference-runtime";

function buildFeedDefinition(identity: ReturnType<typeof createIdentity>): FeedDefinitionStateV1 {
  const now = new Date().toISOString();
  return signState(identity, {
    actor: identity.actor_id,
    content_class: "mutable_public",
    created_at: now,
    payload: {
      params: {},
      reduce: "relay.reduce.reverse_chronological.v1",
      sources: [{ actor_id: identity.actor_id, kind: "actor_log" as const }]
    },
    storage_class: "state",
    type: "relay.feed.definition.v1",
    updated_at: now,
    version: 1
  }) as unknown as FeedDefinitionStateV1;
}

export function App() {
  const { runtime, identity, feedDef } = useMemo(() => {
    const id = createIdentity();
    const mem = new MemoryStorage();
    const rt = new ReferenceRuntime(mem, id);
    const def = buildFeedDefinition(id);
    return { runtime: rt, identity: id, feedDef: def };
  }, []);

  const [lastN, setLastN] = useState(20);
  const [body, setBody] = useState("");
  const [version, setVersion] = useState(0);

  const boundary: BoundaryV2 | null = useMemo(() => {
    return runtime.latestClosedEventWindow(identity.actor_id, lastN, { types: ["post"] });
  }, [runtime, identity.actor_id, lastN, version]);

  const reduce = useMemo(() => {
    if (!boundary) return null;
    try {
      return runtime.runDeterministicFeed(feedDef, boundary);
    } catch {
      return null;
    }
  }, [runtime, feedDef, boundary]);

  const posts: { ev: RelayEventV1; st: RelayStateV1 | undefined }[] = useMemo(() => {
    if (!reduce) return [];
    const out: { ev: RelayEventV1; st: RelayStateV1 | undefined }[] = [];
    for (const eid of reduce.event_ids) {
      const ev = runtime.storage.getEvent(eid);
      if (!ev) continue;
      const ref = ev.data.state_id as string | undefined;
      const st = ref ? runtime.getState(ref) : undefined;
      out.push({ ev, st });
    }
    return out;
  }, [reduce, runtime]);

  const [snapInfo, setSnapInfo] = useState<{ id: string; root: string } | null>(null);

  const publish = useCallback(() => {
    const t = body.trim();
    if (!t) return;
    const now = new Date().toISOString();
    const head = runtime.storage.getActorHead(identity.actor_id);
    const st = signState(identity, {
      actor: identity.actor_id,
      content_class: "mutable_public",
      created_at: now,
      payload: { body: t },
      storage_class: "state",
      type: "post",
      updated_at: now,
      version: 1
    });
    runtime.putState(st);
    const ev = signEvent(identity, {
      actor: identity.actor_id,
      content_class: "durable_public",
      data: { state_id: st.id, type: "post" },
      prev: head,
      storage_class: "log",
      ts: now,
      type: "state.commit"
    });
    runtime.appendEvent(ev);
    setBody("");
    setVersion((v) => v + 1);
  }, [body, identity, runtime]);

  const buildSnapshot = useCallback(() => {
    const states = runtime.storage.allStateIds().map((i) => runtime.getState(i)!);
    if (states.length === 0) {
      setSnapInfo(null);
      return;
    }
    const id = `relay:snapshot:demo-${Date.now()}`;
    const snap = runtime.createSnapshot(id, new Date().toISOString(), { types: ["post"] }, () => states);
    setSnapInfo({ id: snap.id, root: snap.root_hash });
  }, [runtime]);

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 520, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Relay v2 demo</h1>
      <p style={{ color: "#555" }}>
        In-memory reference runtime + <code>relay.reduce.reverse_chronological.v1</code>. Feed uses a closed{" "}
        <code>event_ranges</code> window (last N along your per-actor log).
      </p>
      <section style={{ marginBottom: "1.5rem" }}>
        <label>
          Last N (event window):{" "}
          <input
            type="number"
            min={1}
            max={100}
            value={lastN}
            onChange={(e) => setLastN(Number(e.target.value) || 1)}
          />
        </label>
      </section>
      <section style={{ marginBottom: "1rem" }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          style={{ width: "100%", boxSizing: "border-box" }}
          placeholder="New post"
        />
        <button type="button" onClick={publish} style={{ marginTop: 8 }}>
          Publish
        </button>
      </section>
      <section>
        <h2>Feed</h2>
        {boundary ? (
          <pre style={{ fontSize: 12, background: "#f4f4f4", padding: 8, overflow: "auto" }}>
            {boundaryCanonicalString(boundary)}
          </pre>
        ) : (
          <p>No events yet.</p>
        )}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {posts.map(({ ev, st }) => (
            <li key={ev.id} style={{ borderBottom: "1px solid #ddd", padding: "0.75rem 0" }}>
              <div style={{ fontSize: 12, color: "#888" }}>{ev.ts}</div>
              <div>{String(st?.payload.body ?? "")}</div>
            </li>
          ))}
        </ul>
      </section>
      <section style={{ marginTop: "2rem" }}>
        <h2>Snapshot (§0.5.1)</h2>
        <button type="button" onClick={buildSnapshot}>
          Build snapshot over post states
        </button>
        {snapInfo && (
          <pre style={{ fontSize: 12, background: "#eef", padding: 8, marginTop: 8 }}>
            {JSON.stringify(snapInfo, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
