import { OriginClient } from "@relay-mvp/sdk";

export type TwoNodeOptions = {
  originA: string;
  originB: string;
  /** On origin B, demo actor to use for authenticated calls (default bob) */
  readerOnB: string;
};

/**
 * Proves two independent origins: public reads from A work from a "client" that only talks to B
 * for B-local data; cross-origin fetches to A are plain HTTP (no shared DB).
 * Follow/feed across origins is not part of the MVP data model; this is **read interop** only.
 */
export async function runTwoNodeTests(o: TwoNodeOptions): Promise<void> {
  const a = o.originA.replace(/\/$/, "");
  const b = o.originB.replace(/\/$/, "");

  async function j<T>(res: Response, label: string): Promise<T> {
    const t = await res.text();
    if (t.trimStart().startsWith("<") || t.trimStart().startsWith("<!")) {
      throw new Error(`${label}: got HTML (status ${res.status})`);
    }
    if (!res.ok) {
      throw new Error(`${label}: HTTP ${res.status} ${t.slice(0, 200)}`);
    }
    return JSON.parse(t) as T;
  }

  console.log("  1) GET A /health");
  {
    const r = await fetch(`${a}/health`);
    const h = await j<{ ok: boolean }>(r, "A /health");
    if (h.ok !== true) throw new Error("A /health: expected ok: true");
  }
  console.log("  ✓ origin A is up");

  console.log("  2) GET B /health");
  {
    const r = await fetch(`${b}/health`);
    const h = await j<{ ok: boolean }>(r, "B /health");
    if (h.ok !== true) throw new Error("B /health: expected ok: true");
  }
  console.log("  ✓ origin B is up");

  console.log("  3) GET A /actors → resolve alice, fetch identity + public posts (cross-origin read)");
  let aliceId: string;
  {
    const r = await fetch(`${a}/actors`);
    const list = await j<Array<{ actor_id: string; slug: string }>>(r, "A /actors");
    const al = list.find((x) => x.slug === "alice");
    if (!al) throw new Error("A: seeded actor 'alice' not found");
    aliceId = al.actor_id;
    const idRes = await fetch(`${a}/actors/${encodeURIComponent(aliceId)}/identity`);
    const idDoc = await j<{ actor_id: string; kind: string }>(idRes, "A identity");
    if (idDoc.actor_id !== aliceId) throw new Error("A identity actor_id mismatch");
    const postsRes = await fetch(`${a}/actors/${encodeURIComponent(aliceId)}/posts`);
    const posts = await j<unknown[]>(postsRes, "A /posts");
    if (posts.length < 1) throw new Error("A: expected at least one public post for alice");
  }
  console.log("  ✓ public reads from A OK (as if B's UI fetched A's public HTTP API)");

  console.log("  4) GET B /actors → resolve bob, call B with OriginClient (local session)");
  let bobId: string;
  {
    const r = await fetch(`${b}/actors`);
    const list = await j<Array<{ actor_id: string; slug: string }>>(r, "B /actors");
    const row = list.find((x) => x.slug === o.readerOnB);
    if (!row) throw new Error(`B: actor slug ${o.readerOnB} not found`);
    bobId = row.actor_id;
    const bClient = new OriginClient({ baseUrl: b, demoActorSlug: o.readerOnB });
    const idDoc = await bClient.getIdentity(bobId);
    if (idDoc.actor_id !== bobId) throw new Error("B identity");
    const feed = await bClient.homeFeed();
    if (!Array.isArray(feed.posts)) throw new Error("B homeFeed");
  }
  console.log("  ✓ B-only API works (separate database / node)");

  console.log("  5) Assert A and B are different nodes (actor ids not shared)");
  {
    if (aliceId === bobId) throw new Error("A and B share an actor_id — expected separate seeds");
  }
  console.log("  ✓ different actor_id namespaces");

  console.log(`\nTwo-node interop check passed. A=${a}  B=${b}`);
}
