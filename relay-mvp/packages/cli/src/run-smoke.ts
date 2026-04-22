import { IndexerClient, OriginClient } from "@relay-mvp/sdk";

export type SmokeOptions = {
  originUrl: string;
  indexerUrl?: string;
  /** Demo actor for write-capable calls (default alice) */
  writer: string;
  /** Demo actor for read-only / feed (default bob) */
  reader: string;
};

function ok(name: string, detail?: string): void {
  const d = detail ? ` ${detail}` : "";
  console.log(`  ✓ ${name}${d}`);
}

function fail(name: string, err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  ✗ ${name}: ${msg}`);
  return process.exit(1) as never;
}

export async function runSmokeTests(o: SmokeOptions): Promise<void> {
  const root = o.originUrl.replace(/\/$/, "");
  const writer = o.writer;
  const reader = o.reader;

  {
    const r = await fetch(`${root}/health`);
    if (!r.ok) fail("GET /health", new Error(`HTTP ${r.status}`));
    const j = (await r.json()) as { ok?: boolean };
    if (j.ok !== true) fail("GET /health body", new Error("expected { ok: true }"));
    ok("GET /health");
  }

  const wClient = new OriginClient({ baseUrl: root, demoActorSlug: writer });
  const rClient = new OriginClient({ baseUrl: root, demoActorSlug: reader });

  let actors: Array<{ actor_id: string; slug: string }> = [];
  try {
    actors = await wClient.listActors();
  } catch (e) {
    fail("GET /actors", e);
  }
  if (actors.length < 1) fail("GET /actors", new Error("expected at least one actor"));
  ok("GET /actors", `(${actors.length} actors)`);

  const bySlug = new Map(actors.map((a) => [a.slug, a] as const));
  const wAct = bySlug.get(writer);
  const rAct = bySlug.get(reader);
  if (!wAct) fail("seed actors", new Error(`missing --writer slug "${writer}" in /actors`));
  if (!rAct) fail("seed actors", new Error(`missing --reader slug "${reader}" in /actors`));
  if (wAct.actor_id === rAct.actor_id) {
    fail("options", new Error("writer and reader must be different actor slugs"));
  }

  try {
    const id = await wClient.getIdentity(wAct.actor_id);
    if (id.actor_id !== wAct.actor_id) fail("GET identity", new Error("identity.actor_id mismatch"));
    ok("GET /actors/:id/identity", wAct.actor_id);
  } catch (e) {
    fail("GET /actors/:id/identity", e);
  }

  try {
    const log = await wClient.getLog(wAct.actor_id, 0);
    if (!Array.isArray(log.events)) fail("GET log", new Error("missing events[]"));
    ok("GET /actors/:id/log", `${log.events.length} events, next_since_seq=${log.next_since_seq}`);
  } catch (e) {
    fail("GET /actors/:id/log", e);
  }

  try {
    const snap = await wClient.getSnapshot(wAct.actor_id);
    if (snap == null || typeof snap !== "object") fail("GET snapshot", new Error("invalid body"));
    ok("GET /actors/:id/snapshots/latest");
  } catch (e) {
    fail("GET /actors/:id/snapshots/latest", e);
  }

  try {
    const feed = await rClient.homeFeed();
    if (!Array.isArray(feed.posts)) fail("GET /feed/home", new Error("missing posts[]"));
    if (!Array.isArray(feed.following)) fail("GET /feed/home", new Error("missing following[]"));
    ok("GET /feed/home", `reader=${reader} posts=${feed.posts.length} following=${feed.following.length}`);
  } catch (e) {
    fail("GET /feed/home", e);
  }

  if (o.indexerUrl) {
    const idx = o.indexerUrl.replace(/\/$/, "");
    const ic = new IndexerClient(idx);
    try {
      const policy = await ic.getPolicy();
      if (policy == null || typeof policy !== "object") {
        fail("GET /indexer/policy", new Error("invalid body"));
      }
      ok("GET /indexer/policy");
    } catch (e) {
      fail("GET /indexer/policy", e);
    }
    try {
      await ic.explain();
      ok("GET /indexer/explain");
    } catch (e) {
      fail("GET /indexer/explain", e);
    }
  } else {
    console.log("  · skipping indexer (pass --indexer <url> to test)");
  }

  console.log(`\nAll smoke tests passed (origin: ${root}).`);
}
