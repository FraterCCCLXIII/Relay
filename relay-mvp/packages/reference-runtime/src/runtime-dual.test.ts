import { createIdentity, signEvent, signState, type FeedDefinitionStateV1, type RelayEventV1 } from "@relay-mvp/relay";
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStorage } from "./memory-storage.js";
import { ReferenceRuntime } from "./reference-runtime.js";
import { SqliteStorage } from "./sqlite-storage.js"; // Node-only; not in browser barrel

function buildFeedDef(identity: ReturnType<typeof createIdentity>): FeedDefinitionStateV1 {
  const now = "2026-04-21T12:00:00.000Z";
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

function makeCommitEvent(identity: ReturnType<typeof createIdentity>, prev: string | null, body: string, ts: string): RelayEventV1 {
  return signEvent(identity, {
    actor: identity.actor_id,
    content_class: "durable_public",
    data: { body, state_ref: "post" },
    prev,
    storage_class: "log",
    ts,
    type: "state.commit"
  });
}

describe("dual runtime (memory vs sqlite)", () => {
  it("produces identical reduce output (same identity, same events)", () => {
    const identity = createIdentity();
    const e1 = makeCommitEvent(identity, null, "one", "2026-04-21T12:00:00.000Z");
    const e2 = makeCommitEvent(identity, e1.id, "two", "2026-04-21T12:00:01.000Z");
    const def = buildFeedDef(identity);

    const mem = new MemoryStorage();
    const rtm = new ReferenceRuntime(mem, identity);
    rtm.appendEvent(e1);
    rtm.appendEvent(e2);
    const bm = rtm.latestClosedEventWindow(identity.actor_id, 10)!;
    const outM = rtm.runDeterministicFeed(def, bm);

    const dir = mkdtempSync(join(tmpdir(), "relay-v2-"));
    const dbPath = join(dir, "t.db");
    const sql = new SqliteStorage(dbPath);
    const rts = new ReferenceRuntime(sql, identity);
    rts.appendEvent(e1);
    rts.appendEvent(e2);
    const bs = rts.latestClosedEventWindow(identity.actor_id, 10)!;
    const outS = rts.runDeterministicFeed(def, bs);

    sql.close();
    rmSync(dir, { recursive: true, force: true });

    expect(outM.event_ids).toEqual(outS.event_ids);
    expect(outM.event_ids[0]).toBe(e2.id);
  });
});
