/**
 * Demo seed: actors, identity, posts, channel, follows.
 * Run after db:migrate. Idempotent-ish: clears MVP tables and reinserts.
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import {
  actorIdFromPublicKeyRaw,
  canonicalStringify,
  channelIdFromSeed,
  eventIdFromPayload,
  stubSignature,
  type IdentityDocument,
  type StateObject,
} from "@relay-mvp/protocol";
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { randomUUID } from "node:crypto";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

function minutesLater(iso: string, n: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + n);
  return d.toISOString();
}

async function appendSeedLog(
  c: PoolClient,
  logHead: Map<string, string | null>,
  actorId: string,
  partial: { type: string; target?: string; data: Record<string, unknown>; ts: string },
): Promise<void> {
  const prev = logHead.get(actorId) ?? null;
  const envelopeCore = {
    kind: "log" as const,
    actor: actorId,
    target: partial.target,
    type: partial.type,
    ts: partial.ts,
    prev,
    data: partial.data,
  };
  const eventId = eventIdFromPayload(canonicalStringify(envelopeCore));
  const sig = stubSignature(actorId, canonicalStringify(envelopeCore));
  const full = { ...envelopeCore, event_id: eventId, signature: sig };
  await c.query(
    `INSERT INTO log_events (event_id, actor_id, target, type, ts, prev, data, signature, raw)
     VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7::jsonb,$8,$9::jsonb)`,
    [
      eventId,
      actorId,
      partial.target ?? null,
      partial.type,
      partial.ts,
      prev,
      JSON.stringify(partial.data),
      sig,
      JSON.stringify(full),
    ],
  );
  logHead.set(actorId, eventId);
}

async function insertPost(
  c: PoolClient,
  logHead: Map<string, string | null>,
  actorId: string,
  objectId: string,
  payload: Record<string, unknown>,
  ts: string,
): Promise<void> {
  const signature = stubSignature(actorId, canonicalStringify({ objectId, version: 1, payload }));
  await c.query(
    `INSERT INTO state_objects (actor_id, object_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at)
     VALUES ($1,$2,'post',1,'dual','durable_public',false,$3::jsonb,$4,$5::timestamptz,$6::timestamptz)`,
    [actorId, objectId, JSON.stringify(payload), signature, ts, ts],
  );
  await appendSeedLog(c, logHead, actorId, {
    type: "state.commit",
    ts,
    data: { object_id: objectId, version: 1 },
  });
}

async function main() {
  const now = new Date().toISOString();

  const alicePriv = ed.utils.randomPrivateKey();
  const alicePub = await ed.getPublicKey(alicePriv);
  const aliceId = actorIdFromPublicKeyRaw(alicePub);

  const bobPriv = ed.utils.randomPrivateKey();
  const bobPub = await ed.getPublicKey(bobPriv);
  const bobId = actorIdFromPublicKeyRaw(bobPub);

  const modPriv = ed.utils.randomPrivateKey();
  const modPub = await ed.getPublicKey(modPriv);
  const modId = actorIdFromPublicKeyRaw(modPub);

  const channelId = channelIdFromSeed("relay-demo-general");
  const channelDevId = channelIdFromSeed("relay-demo-dev");
  const channelLoungeId = channelIdFromSeed("relay-demo-lounge");
  const channelAnnounceId = channelIdFromSeed("relay-demo-announcements");

  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "TRUNCATE labels, channel_refs, channels, follows, reactions, log_events, state_objects, identity_docs, actors CASCADE",
    );

    for (const row of [
      { id: aliceId, slug: "alice", pk: Buffer.from(alicePub).toString("base64") },
      { id: bobId, slug: "bob", pk: Buffer.from(bobPub).toString("base64") },
      { id: modId, slug: "mod", pk: Buffer.from(modPub).toString("base64") },
    ]) {
      await c.query(
        "INSERT INTO actors (actor_id, slug, public_key_b64) VALUES ($1, $2, $3)",
        [row.id, row.slug, row.pk],
      );
    }

    const identities: IdentityDocument[] = [
      {
        kind: "identity",
        actor_id: aliceId,
        updated_at: now,
        relay_profiles: ["relay.profile.social"],
        keys: {
          active: { id: "key:active:1", alg: "ed25519", public_key_b64: Buffer.from(alicePub).toString("base64") },
        },
        display_name: "Alice",
        bio: "Demo publisher",
      },
      {
        kind: "identity",
        actor_id: bobId,
        updated_at: now,
        relay_profiles: ["relay.profile.social"],
        keys: {
          active: { id: "key:active:1", alg: "ed25519", public_key_b64: Buffer.from(bobPub).toString("base64") },
        },
        display_name: "Bob",
        bio: "Demo reader",
      },
      {
        kind: "identity",
        actor_id: modId,
        updated_at: now,
        relay_profiles: ["relay.profile.social"],
        keys: {
          active: { id: "key:active:1", alg: "ed25519", public_key_b64: Buffer.from(modPub).toString("base64") },
        },
        display_name: "Mod",
        bio: "Channel moderator (demo)",
      },
    ];

    for (const id of identities) {
      const sig = stubSignature(id.actor_id, canonicalStringify({ ...id, signature: undefined }));
      const doc = { ...id, signature: sig };
      await c.query(
        "INSERT INTO identity_docs (actor_id, doc, updated_at) VALUES ($1, $2, $3::timestamptz)",
        [id.actor_id, doc, id.updated_at],
      );
    }

    const aliceProfile: StateObject = {
      kind: "state",
      object_id: "profile:main",
      actor_id: aliceId,
      schema: "profile",
      version: 1,
      storage_class: "dual",
      content_class: "durable_public",
      created_at: now,
      updated_at: now,
      payload: { display_name: "Alice", bio: "Demo publisher" },
      signature: stubSignature(aliceId, canonicalStringify({ display_name: "Alice", bio: "Demo publisher" })),
    };

    const bobProfile: StateObject = {
      kind: "state",
      object_id: "profile:main",
      actor_id: bobId,
      schema: "profile",
      version: 1,
      storage_class: "dual",
      content_class: "durable_public",
      created_at: now,
      updated_at: now,
      payload: { display_name: "Bob", bio: "Demo reader" },
      signature: stubSignature(bobId, canonicalStringify({ display_name: "Bob", bio: "Demo reader" })),
    };

    for (const s of [aliceProfile, bobProfile]) {
      await c.query(
        `INSERT INTO state_objects (actor_id, object_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,false,$7::jsonb,$8,$9::timestamptz,$10::timestamptz)`,
        [
          s.actor_id,
          s.object_id,
          s.schema,
          s.version,
          s.storage_class,
          s.content_class,
          JSON.stringify(s.payload),
          s.signature,
          s.created_at,
          s.updated_at,
        ],
      );
    }

    const logHead = new Map<string, string | null>();
    for (const id of [aliceId, bobId, modId]) logHead.set(id, null);

    const t0 = now;
    const postHello = `post:${randomUUID()}`;
    const postHttp = `post:${randomUUID()}`;
    const postChannels = `post:${randomUUID()}`;
    const postLabels = `post:${randomUUID()}`;
    const postThreadRoot = `post:${randomUUID()}`;
    const postBob1 = `post:${randomUUID()}`;
    const postBob2 = `post:${randomUUID()}`;
    const postAliceReply = `post:${randomUUID()}`;
    const postBobReply = `post:${randomUUID()}`;
    const postModNote = `post:${randomUUID()}`;

    await insertPost(c, logHead, aliceId, postHello, {
      title: "Hello Relay",
      body: "Origin-authoritative posts and channel overlays. This feed is seeded for the MVP demo.",
      reply_to: null,
    }, t0);

    await insertPost(c, logHead, aliceId, postHttp, {
      title: "HTTP stays source of truth",
      body: "The WebSocket relay is acceleration only. If you disconnect live updates, clients still converge by fetching the origin and snapshots.",
      reply_to: null,
    }, minutesLater(t0, 2));

    await insertPost(c, logHead, aliceId, postChannels, {
      title: "Channels ≠ global delete",
      body: "Removing a post from a channel applies a moderation label on that slice of the UI. The author's object at their origin is unchanged unless they delete it.",
      reply_to: null,
    }, minutesLater(t0, 5));

    await insertPost(c, logHead, aliceId, postLabels, {
      title: "Labels are overlays",
      body: "Spam, removed_from_channel, trusted_source, etc. attach metadata without mutating the author's signed payload.",
      reply_to: null,
    }, minutesLater(t0, 8));

    await insertPost(c, logHead, aliceId, postThreadRoot, {
      title: "Thread demo — root",
      body: "Replies below use reply_to so the Reader can reconstruct a thread from origin state only.",
      reply_to: null,
    }, minutesLater(t0, 10));

    await insertPost(c, logHead, bobId, postBob1, {
      title: "Bob: thanks for the walkthrough",
      body: "Following alice to build my home timeline. Excited to try channel refs next.",
      reply_to: null,
    }, minutesLater(t0, 12));

    await insertPost(c, logHead, bobId, postBob2, {
      title: "Bob: relay outage question",
      body: "If the relay drops, do I need to poll /feed/home on an interval? (Demo: yes — or navigate to refresh.)",
      reply_to: null,
    }, minutesLater(t0, 15));

    await insertPost(c, logHead, aliceId, postAliceReply, {
      title: "Re: thanks",
      body: "Exactly — snapshot + feed endpoints are the backstop. Relay is best-effort fan-out.",
      reply_to: postBob1,
    }, minutesLater(t0, 18));

    await insertPost(c, logHead, bobId, postBobReply, {
      title: "Re: Re: thanks",
      body: "Got it. Treating WS as a hint, HTTP as truth.",
      reply_to: postAliceReply,
    }, minutesLater(t0, 20));

    await insertPost(c, logHead, modId, postModNote, {
      title: "Mod: welcome",
      body: "I only moderate channel labels here — I cannot edit author posts in place.",
      reply_to: null,
    }, minutesLater(t0, 22));

    const channelRows: Array<[string, string, string, string]> = [
      [channelId, modId, "Relay Demo", "Main community channel — mixed posts from the seed"],
      [channelDevId, modId, "Protocol & dev", "HTTP, labels, channels — implementation talk"],
      [channelLoungeId, aliceId, "Water cooler", "Casual threads and back-and-forth"],
      [channelAnnounceId, modId, "Announcements", "Short updates and mod notes"],
    ];
    for (const [ch, owner, title, desc] of channelRows) {
      await c.query(
        "INSERT INTO channels (channel_id, owner_actor_id, title, description, created_at) VALUES ($1,$2,$3,$4,$5::timestamptz)",
        [ch, owner, title, desc, now],
      );
    }

    const ref = (ch: string, pid: string, submitter: string) =>
      c.query("INSERT INTO channel_refs (channel_id, post_object_id, submitter_actor_id) VALUES ($1,$2,$3)", [ch, pid, submitter]);

    for (const pid of [postHello, postHttp, postChannels, postThreadRoot, postBob1]) {
      await ref(channelId, pid, aliceId);
    }
    await ref(channelId, postBob2, bobId);

    for (const pid of [postHttp, postLabels, postChannels]) {
      await ref(channelDevId, pid, aliceId);
    }

    for (const [pid, sub] of [
      [postBob1, bobId],
      [postBob2, bobId],
      [postThreadRoot, aliceId],
    ] as const) {
      await ref(channelLoungeId, pid, sub);
    }

    for (const [pid, sub] of [
      [postHello, aliceId],
      [postModNote, modId],
    ] as const) {
      await ref(channelAnnounceId, pid, sub);
    }

    await c.query("INSERT INTO follows (follower_id, followee_id) VALUES ($1,$2)", [bobId, aliceId]);
    await c.query("INSERT INTO follows (follower_id, followee_id) VALUES ($1,$2)", [aliceId, bobId]);
    await c.query("INSERT INTO follows (follower_id, followee_id) VALUES ($1,$2)", [bobId, modId]);

    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }

  console.log("Seed complete.");
  console.log("Actor IDs (use X-Demo-Actor: alice | bob | mod):");
  console.log("  alice:", aliceId);
  console.log("  bob:  ", bobId);
  console.log("  mod:  ", modId);
  console.log("  channel (Relay Demo):", channelId);
  console.log("  channel (Protocol & dev):", channelDevId);
  console.log("  channel (Water cooler):", channelLoungeId);
  console.log("  channel (Announcements):", channelAnnounceId);
  console.log("\nSave these in apps/web .env if you need fixed IDs (optional).");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
