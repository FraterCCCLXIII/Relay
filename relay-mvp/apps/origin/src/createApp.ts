import "express-async-errors";
import cors from "cors";
import express, { type Express } from "express";
import { randomUUID, createHmac, createHash, randomBytes } from "node:crypto";
import { canonicalStringify, channelIdFromSeed, stubSignature, type ConflictErrorBody, type LogEventEnvelope } from "@relay-mvp/protocol";
import { pool } from "./db.js";
import {
  demoHeaderAllowed,
  getSessionIdFromRequest,
  requireActor,
  resolveActor,
  SESSION_COOKIE,
} from "./demoActor.js";
import { httpsigRequired, routeNeedsHttpsig, verifyHttpsigForActor } from "./httpsig.js";
import { canViewPrivateChannel, isChannelOwner } from "./logic/channelAccess.js";
import { decryptChannelSecret, encryptChannelSecret } from "./logic/channelCrypto.js";
import { appendLog, getLogHead } from "./logic/appendLog.js";
import { stateRowToObject } from "./logic/stateRowToObject.js";
import { publishToRelay } from "./relayPublish.js";
import { addFullAuthRoutes } from "./auth/fullAuthRoutes.js";
import { createRelayWebSession } from "./auth/webSession.js";

export function createApp(): Express {
  const app = express();
  const RELAY_HELLO_SECRET = process.env.RELAY_HELLO_SECRET ?? "relay-hello-dev";
  const RELAY_HELLO_BUCKET_MS = 5 * 60 * 1000;
  const relayHelloBucket = (t = Date.now()) => Math.floor(t / RELAY_HELLO_BUCKET_MS) * RELAY_HELLO_BUCKET_MS;
  const relayHelloToken = (actorId: string, bucket: number) =>
    createHmac("sha256", RELAY_HELLO_SECRET).update(`${actorId}\n${bucket}`).digest("hex");

  app.use(cors({ origin: true, credentials: true }));
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  if (httpsigRequired()) {
    app.use(async (req, res, next) => {
      if (!routeNeedsHttpsig(req)) return next();
      const actorId = await resolveActor(req);
      if (!actorId) {
        return res.status(401).json({ error: "httpsig_requires_auth" });
      }
      const ok = await verifyHttpsigForActor(
        req as express.Request & { rawBody?: Buffer },
        res,
        actorId,
      );
      if (!ok) return;
      next();
    });
  }

  // Browsers only request path "/"; the hash in ...:3001/#/health is not sent. Redirect helps mistaken bookmarks.
  app.get("/", (_req, res) => res.redirect(302, "/health"));
  app.get("/health", (req, res) => {
    const body = { ok: true, role: "origin" } as const;
    // Top-level navigation → readable page. fetch/curl/health probes (no / other dest) still get JSON.
    if (req.get("sec-fetch-dest") === "document" || req.query.view === "html") {
      res.type("html").send(
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Origin · health</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;line-height:1.5;}code{background:#f4f4f4;padding:0.1em 0.35em;border-radius:4px;} .ok{color:#0a7f2e;font-weight:600;}</style></head>
<body><h1 class="ok">OK</h1><p>Origin is running.</p>
<p>Role: <code>${body.role}</code></p>
<p>API and scripts should request JSON (default). In a browser, add <a href="?view=html"><code>?view=html</code></a> if this page does not show automatically.</p>
</body></html>`,
      );
      return;
    }
    res.json(body);
  });

  app.post("/auth/login", async (req, res) => {
    const { slug } = req.body as { slug?: string };
    if (!slug) return res.status(400).json({ error: "invalid_body" });
    const r = await pool.query<{ actor_id: string; slug: string }>(
      "SELECT actor_id, slug FROM actors WHERE LOWER(slug) = LOWER($1)",
      [slug.trim()],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "unknown_actor" });
    await createRelayWebSession(res, r.rows[0].actor_id);
    res.json({ ok: true, actor_id: r.rows[0].actor_id, slug: r.rows[0].slug });
  });

  app.post("/auth/logout", async (req, res) => {
    const sid = getSessionIdFromRequest(req);
    if (sid) await pool.query("DELETE FROM auth_sessions WHERE session_id = $1", [sid]);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    res.json({ ok: true });
  });

  app.get("/auth/me", async (req, res) => {
    const aid = await resolveActor(req);
    if (!aid) return res.status(401).json({ error: "unauthorized" });
    const r = await pool.query("SELECT slug FROM actors WHERE actor_id = $1", [aid]);
    res.json({ actor_id: aid, slug: r.rows[0]?.slug });
  });

  addFullAuthRoutes(app);

  /** Short-lived HMAC for relay HELLO; relay shares RELAY_HELLO_SECRET. */
  app.get("/auth/relay-ws", async (req, res) => {
    let aid = await resolveActor(req);
    if (!aid) {
      const slug = (req.query.actor_slug as string | undefined)?.trim();
      if (slug && demoHeaderAllowed()) {
        const r = await pool.query<{ actor_id: string }>(
          "SELECT actor_id FROM actors WHERE LOWER(slug) = LOWER($1)",
          [slug],
        );
        aid = r.rows[0]?.actor_id ?? null;
      }
    }
    if (!aid) return res.status(401).json({ error: "unauthorized" });
    const bucket = relayHelloBucket();
    res.json({ actor_id: aid, hello_bucket: bucket, demo_token: relayHelloToken(aid, bucket) });
  });

  app.get("/.well-known/relay", (_req, res) => {
    res.json({
      version: "0.1",
      name: "relay-mvp",
      links: { actors: "/actors", home_feed: "/feed/home" },
    });
  });

  app.get("/federation/resolve", async (req, res) => {
    const base = (req.query.origin_url as string | undefined)?.trim();
    const slug = (req.query.slug as string | undefined)?.trim().toLowerCase();
    if (!base || !slug) {
      return res.status(400).json({ error: "origin_url and slug required" });
    }
    const allowed = await pool.query("SELECT 1 FROM federation_peers WHERE origin_url = $1", [base]);
    if (allowed.rowCount === 0) {
      return res.status(403).json({ error: "origin_not_trusted" });
    }
    const u = new URL("/actors", base.endsWith("/") ? base : `${base}/`);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8_000);
    let remote: { actor_id: string; slug: string } | undefined;
    try {
      const r = await fetch(u, { signal: ac.signal });
      if (!r.ok) return res.status(502).json({ error: "remote_fetch_failed", status: r.status });
      const rows = (await r.json()) as Array<{ actor_id: string; slug: string }>;
      remote = rows.find((x) => x.slug.toLowerCase() === slug);
    } catch (e) {
      return res.status(502).json({ error: "remote_unreachable", message: (e as Error).message });
    } finally {
      clearTimeout(t);
    }
    if (!remote) return res.status(404).json({ error: "actor_not_on_origin" });
    res.json({ ...remote, origin: base });
  });

  const adminToken = process.env.RELAY_ADMIN_TOKEN;
  if (adminToken) {
    app.get("/admin/health", async (req, res) => {
      if (req.header("x-admin-token") !== adminToken) return res.status(401).json({ error: "unauthorized" });
      await pool.query("INSERT INTO audit_log (action, detail) VALUES ($1, $2::jsonb)", [
        "admin.health",
        JSON.stringify({ at: new Date().toISOString() }),
      ]);
      res.json({ ok: true, role: "admin", time: new Date().toISOString() });
    });

    app.post("/federation/peers", async (req, res) => {
      if (req.header("x-admin-token") !== adminToken) return res.status(401).json({ error: "unauthorized" });
      const { origin_url, label } = req.body as { origin_url?: string; label?: string };
      if (!origin_url?.trim()) return res.status(400).json({ error: "origin_url required" });
      const u = origin_url.replace(/\/$/, "");
      await pool.query(
        "INSERT INTO federation_peers (origin_url, label) VALUES ($1, $2) ON CONFLICT (origin_url) DO UPDATE SET label = EXCLUDED.label",
        [u, label ?? null],
      );
      await pool.query("INSERT INTO audit_log (action, detail) VALUES ($1, $2::jsonb)", [
        "federation.peer_upsert",
        JSON.stringify({ origin_url: u }),
      ]);
      res.json({ ok: true, origin_url: u });
    });
  }

  app.get("/internal/metrics", (req, res) => {
    const tok = process.env.RELAY_INTERNAL_METRICS_TOKEN ?? process.env.RELAY_ADMIN_TOKEN;
    if (!tok) return res.status(503).json({ error: "metrics_not_configured" });
    if (req.header("x-admin-token") !== tok) return res.status(401).json({ error: "unauthorized" });
    res.type("text/plain; version=0.0.4").send(
      `# TYPE relay_mvp_info gauge\nrelay_mvp_info{version="0.1"} 1\n`,
    );
  });

  app.get("/actors", async (_req, res) => {
    const r = await pool.query("SELECT actor_id, slug FROM actors ORDER BY slug");
    res.json(r.rows);
  });

  app.get("/actors/:actorId/identity", async (req, res) => {
    const r = await pool.query("SELECT doc FROM identity_docs WHERE actor_id = $1", [req.params.actorId]);
    if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(r.rows[0].doc);
  });

  app.get("/actors/:actorId/state/:objectId", async (req, res) => {
    const r = await pool.query(
      `SELECT object_id, actor_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at
       FROM state_objects WHERE actor_id = $1 AND object_id = $2`,
      [req.params.actorId, req.params.objectId],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(stateRowToObject(r.rows[0]));
  });

  /** Create/update state. Body: { schema, payload, expected_version?, storage_class?, content_class?, deleted? } */
  app.put("/actors/:actorId/state/:objectId", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    if (actorId !== req.params.actorId) {
      return res.status(403).json({ error: "actor_mismatch", message: "Cannot write another actor's state." });
    }

    const objectId = req.params.objectId;
    const {
      schema,
      payload,
      expected_version,
      storage_class = "dual",
      content_class = "durable_public",
      deleted = false,
    } = req.body as {
      schema?: string;
      payload?: Record<string, unknown>;
      expected_version?: number;
      storage_class?: string;
      content_class?: string;
      deleted?: boolean;
    };

    if (!schema || !payload) {
      return res.status(400).json({ error: "invalid_body", message: "schema and payload required" });
    }

    const now = new Date().toISOString();
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const cur = await c.query(
        "SELECT version, deleted FROM state_objects WHERE actor_id = $1 AND object_id = $2 FOR UPDATE",
        [actorId, objectId],
      );

      let nextVersion: number;
      if (!cur.rows[0]) {
        if (expected_version !== undefined && expected_version !== 0) {
          await c.query("ROLLBACK");
          const body: ConflictErrorBody = {
            error: "conflict_detected",
            object_id: objectId,
            expected_version,
            authoritative_version: 0,
            message: "Object does not exist; expected_version should be 0 or omitted for create.",
          };
          return res.status(409).json(body);
        }
        nextVersion = 1;
      } else {
        const v = cur.rows[0].version as number;
        if (expected_version !== undefined && expected_version !== v) {
          await c.query("ROLLBACK");
          const body: ConflictErrorBody = {
            error: "conflict_detected",
            object_id: objectId,
            expected_version,
            authoritative_version: v,
            message: "Origin has a newer version. Fetch GET state and retry.",
          };
          return res.status(409).json(body);
        }
        nextVersion = v + 1;
      }

      const signature = stubSignature(actorId, canonicalStringify({ objectId, nextVersion, payload }));

      if (!cur.rows[0]) {
        await c.query(
          `INSERT INTO state_objects (actor_id, object_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::timestamptz,$11::timestamptz)`,
          [
            actorId,
            objectId,
            schema,
            nextVersion,
            storage_class,
            content_class,
            deleted,
            JSON.stringify(payload),
            signature,
            now,
            now,
          ],
        );
      } else {
        await c.query(
          `UPDATE state_objects SET version = $3, storage_class = $4, content_class = $5, deleted = $6,
             payload = $7::jsonb, signature = $8, updated_at = $9::timestamptz
           WHERE actor_id = $1 AND object_id = $2`,
          [
            actorId,
            objectId,
            nextVersion,
            storage_class,
            content_class,
            deleted,
            JSON.stringify(payload),
            signature,
            now,
          ],
        );
      }

      const logType = deleted ? "state.delete" : "state.commit";
      const head = await getLogHead(c, actorId);
      await appendLog(c, actorId, {
        actor: actorId,
        type: logType,
        ts: now,
        prev: head,
        data: { object_id: objectId, version: nextVersion },
      });

      await c.query("COMMIT");

      const out = await pool.query(
        `SELECT object_id, actor_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at
         FROM state_objects WHERE actor_id = $1 AND object_id = $2`,
        [actorId, objectId],
      );
      const state = stateRowToObject(out.rows[0]);

      void publishToRelay({
        topic: `actor:${actorId}`,
        envelope_kind: "state",
        payload: state,
      });

      res.json(state);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });

  app.get("/actors/:actorId/log", async (req, res) => {
    const since = req.query.since_seq ? Number(req.query.since_seq) : 0;
    const r = await pool.query(
      `SELECT seq, raw FROM log_events WHERE actor_id = $1 AND seq > $2 ORDER BY seq ASC LIMIT 500`,
      [req.params.actorId, since],
    );
    const nextSeq = r.rows.length > 0 ? Number(r.rows[r.rows.length - 1].seq) : since;
    res.json({ events: r.rows.map((x) => x.raw as LogEventEnvelope), next_since_seq: nextSeq });
  });

  /** Append log as authenticated actor (follows, reactions, channel events). */
  app.post("/actors/:actorId/log", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    if (actorId !== req.params.actorId) {
      return res.status(403).json({ error: "actor_mismatch" });
    }

    const body = req.body as Partial<LogEventEnvelope>;
    if (!body.type || !body.ts) {
      return res.status(400).json({ error: "invalid_body" });
    }

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const head = await getLogHead(c, actorId);
      if (body.prev !== undefined && body.prev !== head) {
        await c.query("ROLLBACK");
        return res.status(409).json({
          error: "log_prev_mismatch",
          head,
          message: "Fetch log tail and retry with correct prev.",
        });
      }
      const ev = await appendLog(c, actorId, {
        actor: actorId,
        target: body.target,
        type: body.type,
        ts: body.ts,
        prev: head,
        data: body.data ?? {},
        signature: body.signature,
      });
      await c.query("COMMIT");
      res.json(ev);
    } catch (e) {
      await c.query("ROLLBACK");
      const err = e as { code?: string; head?: string | null };
      if (err.code === "log_prev_mismatch") {
        return res.status(409).json({ error: "log_prev_mismatch", head: err.head });
      }
      throw e;
    } finally {
      c.release();
    }
  });

  app.get("/actors/:actorId/snapshots/latest", async (req, res) => {
    const actorId = req.params.actorId;
    const now = new Date().toISOString();
    const headR = await pool.query(
      "SELECT event_id FROM log_events WHERE actor_id = $1 ORDER BY seq DESC LIMIT 1",
      [actorId],
    );
    const st = await pool.query(
      `SELECT object_id, actor_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at
       FROM state_objects WHERE actor_id = $1 ORDER BY updated_at DESC`,
      [actorId],
    );
    const snapshot_id = `snap:${actorId}:${headR.rows[0]?.event_id ?? "genesis"}`;
    res.json({
      snapshot_id,
      actor_id: actorId,
      as_of_ts: now,
      partial: false,
      log_head_event_id: headR.rows[0]?.event_id ?? null,
      state_objects: st.rows.map(stateRowToObject),
    });
  });

  /** Resolve post object_id to authoritative actor + state (single-tenant MVP). */
  app.get("/objects/:objectId", async (req, res) => {
    const r = await pool.query(
      `SELECT object_id, actor_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at
       FROM state_objects WHERE object_id = $1 LIMIT 1`,
      [req.params.objectId],
    );
    if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(stateRowToObject(r.rows[0]));
  });

  /** Direct replies (comments): posts whose reply_to points at this object_id. */
  app.get("/objects/:objectId/replies", async (req, res) => {
    const r = await pool.query(
      `SELECT object_id, actor_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at
       FROM state_objects
       WHERE schema = 'post' AND deleted = false AND payload->>'reply_to' = $1
       ORDER BY updated_at ASC`,
      [req.params.objectId],
    );
    res.json({ replies: r.rows.map(stateRowToObject) });
  });

  /**
   * Like counts + optional liked_by_me (when X-Demo-Actor is set).
   * Query: repeated target=post:id or comma-separated (MVP: repeated).
   */
  app.get("/reactions/summary", async (req, res) => {
    const raw = req.query.target;
    const targets = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map(String))].filter(Boolean);
    if (targets.length === 0) return res.json({ summaries: {} });

    const counts = await pool.query(
      `SELECT target_object_id, COUNT(*)::int AS c
       FROM reactions
       WHERE target_object_id = ANY($1::text[]) AND reaction_kind = 'like'
       GROUP BY target_object_id`,
      [targets],
    );
    const replies = await pool.query(
      `SELECT payload->>'reply_to' AS parent_id, COUNT(*)::int AS n
       FROM state_objects
       WHERE schema = 'post' AND deleted = false AND payload->>'reply_to' = ANY($1::text[])
       GROUP BY payload->>'reply_to'`,
      [targets],
    );

    const summaries: Record<string, { like_count: number; reply_count: number; liked_by_me: boolean }> = {};
    for (const t of targets) summaries[t] = { like_count: 0, reply_count: 0, liked_by_me: false };
    for (const row of counts.rows) {
      const id = row.target_object_id as string;
      if (summaries[id]) summaries[id].like_count = row.c as number;
    }
    for (const row of replies.rows) {
      const id = row.parent_id as string;
      if (id && summaries[id]) summaries[id].reply_count = row.n as number;
    }

    const me = await resolveActor(req);
    if (me) {
      const mine = await pool.query(
        `SELECT target_object_id FROM reactions
         WHERE reactor_actor_id = $1 AND reaction_kind = 'like' AND target_object_id = ANY($2::text[])`,
        [me, targets],
      );
      for (const row of mine.rows) {
        const id = row.target_object_id as string;
        if (summaries[id]) summaries[id].liked_by_me = true;
      }
    }
    res.json({ summaries });
  });

  /**
   * Toggle like: updates reactions table + appends reaction.add / reaction.remove on the reactor's log.
   * Body: { target_object_id, action: "add" | "remove", reaction_kind?: "like" }
   */
  app.post("/actors/:actorId/reactions", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    if (actorId !== req.params.actorId) return res.status(403).json({ error: "actor_mismatch" });

    const { target_object_id, action, reaction_kind = "like" } = req.body as {
      target_object_id?: string;
      action?: "add" | "remove";
      reaction_kind?: string;
    };
    if (!target_object_id || !action || (action !== "add" && action !== "remove")) {
      return res.status(400).json({ error: "invalid_body", message: "target_object_id and action add|remove required" });
    }

    const post = await pool.query("SELECT object_id FROM state_objects WHERE object_id = $1 AND schema = 'post'", [
      target_object_id,
    ]);
    if (!post.rows[0]) return res.status(404).json({ error: "target_not_found" });

    const ts = new Date().toISOString();
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      if (action === "add") {
        const ins = await c.query(
          `INSERT INTO reactions (reactor_actor_id, target_object_id, reaction_kind, created_at)
           VALUES ($1, $2, $3, $4::timestamptz)
           ON CONFLICT (reactor_actor_id, target_object_id, reaction_kind) DO NOTHING
           RETURNING reactor_actor_id`,
          [actorId, target_object_id, reaction_kind, ts],
        );
        if (ins.rowCount && ins.rowCount > 0) {
          const head = await getLogHead(c, actorId);
          await appendLog(c, actorId, {
            actor: actorId,
            target: target_object_id,
            type: "reaction.add",
            ts,
            prev: head,
            data: { object_id: target_object_id, reaction_kind },
          });
        }
      } else {
        const del = await c.query(
          `DELETE FROM reactions WHERE reactor_actor_id = $1 AND target_object_id = $2 AND reaction_kind = $3 RETURNING reactor_actor_id`,
          [actorId, target_object_id, reaction_kind],
        );
        if (del.rowCount && del.rowCount > 0) {
          const head = await getLogHead(c, actorId);
          await appendLog(c, actorId, {
            actor: actorId,
            target: target_object_id,
            type: "reaction.remove",
            ts,
            prev: head,
            data: { object_id: target_object_id, reaction_kind },
          });
        }
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }

    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM reactions WHERE target_object_id = $1 AND reaction_kind = $2`,
      [target_object_id, reaction_kind],
    );
    const likedR = await pool.query(
      `SELECT 1 FROM reactions WHERE reactor_actor_id = $1 AND target_object_id = $2 AND reaction_kind = $3 LIMIT 1`,
      [actorId, target_object_id, reaction_kind],
    );
    res.json({
      ok: true,
      target_object_id,
      reaction_kind,
      action,
      like_count: countR.rows[0].c as number,
      liked_by_me: !!likedR.rows[0],
    });
  });

  app.get("/actors/:actorId/posts", async (req, res) => {
    const r = await pool.query(
      `SELECT object_id, actor_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at
       FROM state_objects WHERE actor_id = $1 AND schema = 'post' ORDER BY updated_at DESC`,
      [req.params.actorId],
    );
    res.json(r.rows.map(stateRowToObject));
  });

  app.post("/actors/:actorId/follows", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    if (actorId !== req.params.actorId) return res.status(403).json({ error: "actor_mismatch" });
    const { followee_id } = req.body as { followee_id?: string };
    if (!followee_id) return res.status(400).json({ error: "followee_id required" });

    const ins = await pool.query(
      "INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING follower_id",
      [actorId, followee_id],
    );
    if (ins.rowCount === 0) {
      return res.json({ ok: true, note: "already_following" });
    }

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const head = await getLogHead(c, actorId);
      const ev = await appendLog(c, actorId, {
        actor: actorId,
        target: followee_id,
        type: "follow.add",
        ts: new Date().toISOString(),
        prev: head,
        data: {},
      });
      await c.query("COMMIT");
      res.json(ev);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });

  app.delete("/actors/:actorId/follows/:followeeId", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    await pool.query("DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2", [
      actorId,
      req.params.followeeId,
    ]);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const head = await getLogHead(c, actorId);
      const ev = await appendLog(c, actorId, {
        actor: actorId,
        target: req.params.followeeId,
        type: "follow.remove",
        ts: new Date().toISOString(),
        prev: head,
        data: {},
      });
      await c.query("COMMIT");
      res.json(ev);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });

  app.get("/actors/:actorId/following", async (req, res) => {
    const r = await pool.query("SELECT followee_id FROM follows WHERE follower_id = $1", [req.params.actorId]);
    res.json(r.rows.map((x) => x.followee_id));
  });

  app.get("/feed/home", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    const f = await pool.query("SELECT followee_id FROM follows WHERE follower_id = $1", [actorId]);
    const ids = [...new Set([actorId, ...f.rows.map((x) => x.followee_id)])];
    const r = await pool.query(
      `SELECT object_id, actor_id, schema, version, storage_class, content_class, deleted, payload, signature, created_at, updated_at
       FROM state_objects WHERE actor_id = ANY($1::text[]) AND schema = 'post' ORDER BY updated_at DESC LIMIT 100`,
      [ids],
    );
    res.json({
      source: "origin",
      posts: r.rows.map(stateRowToObject),
      following: ids,
    });
  });

  app.get("/channels", async (req, res) => {
    const actorId = await resolveActor(req);
    const r = await pool.query(
      `SELECT c.channel_id, c.owner_actor_id, c.title, c.description, c.created_at, COALESCE(c.visibility, 'public') AS visibility
       FROM channels c
       WHERE c.visibility = 'public'
         OR ($1::text IS NOT NULL AND (
           c.owner_actor_id = $1
           OR EXISTS (SELECT 1 FROM channel_members m WHERE m.channel_id = c.channel_id AND m.actor_id = $1)
         ))
       ORDER BY c.created_at`,
      [actorId],
    );
    res.json(r.rows);
  });

  app.post("/channels", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    const { title, description, visibility, welcome_plaintext } = req.body as {
      title?: string;
      description?: string;
      visibility?: string;
      welcome_plaintext?: string;
    };
    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "invalid_body", message: "title required" });
    }
    const vis = visibility === "private" ? "private" : "public";
    const channelId = channelIdFromSeed(`prv-${randomBytes(12).toString("hex")}`);
    const now = new Date().toISOString();
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        `INSERT INTO channels (channel_id, owner_actor_id, title, description, created_at, visibility)
         VALUES ($1,$2,$3,$4,$5::timestamptz,$6)`,
        [channelId, actorId, title, description ?? null, now, vis],
      );
      if (welcome_plaintext && typeof welcome_plaintext === "string" && welcome_plaintext.length > 0) {
        const { ciphertext, iv } = encryptChannelSecret(welcome_plaintext, channelId);
        await c.query("INSERT INTO channel_secrets (channel_id, ciphertext, iv) VALUES ($1,$2,$3)", [
          channelId,
          ciphertext,
          iv,
        ]);
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    const ch = await pool.query("SELECT * FROM channels WHERE channel_id = $1", [channelId]);
    res.status(201).json({ channel: ch.rows[0] });
  });

  app.get("/channels/:channelId", async (req, res) => {
    const actorId = await resolveActor(req);
    const ch = await pool.query("SELECT * FROM channels WHERE channel_id = $1", [req.params.channelId]);
    if (!ch.rows[0]) return res.status(404).json({ error: "not_found" });
    const vis = (ch.rows[0].visibility as string) ?? "public";
    if (vis === "private") {
      const ok = await canViewPrivateChannel(req.params.channelId, actorId);
      if (!ok) {
        return res.status(403).json({ error: "forbidden", reason: "not_a_member", message: "Private channel: membership required on this origin." });
      }
    }
    const refs = await pool.query(
      `SELECT post_object_id, submitter_actor_id, created_at FROM channel_refs WHERE channel_id = $1 ORDER BY created_at DESC`,
      [req.params.channelId],
    );
    const sec = await pool.query("SELECT ciphertext, iv FROM channel_secrets WHERE channel_id = $1", [req.params.channelId]);
    let private_welcome_plaintext: string | undefined;
    if (sec.rows[0] && (vis === "public" || (await canViewPrivateChannel(req.params.channelId, actorId)))) {
      try {
        private_welcome_plaintext = decryptChannelSecret(sec.rows[0].ciphertext, sec.rows[0].iv, req.params.channelId);
      } catch {
        private_welcome_plaintext = undefined;
      }
    }
    res.json({ channel: ch.rows[0], refs: refs.rows, ...(private_welcome_plaintext ? { private_welcome_plaintext } : {}) });
  });

  app.post("/channels/:channelId/members", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    if (!(await isChannelOwner(req.params.channelId, actorId))) {
      return res.status(403).json({ error: "forbidden", message: "Only the channel owner can add members." });
    }
    const { member_actor_id, member_slug } = req.body as { member_actor_id?: string; member_slug?: string };
    let addId = member_actor_id;
    if (!addId && member_slug) {
      const a = await pool.query("SELECT actor_id FROM actors WHERE lower(slug) = lower($1)", [member_slug]);
      if (!a.rows[0]) return res.status(400).json({ error: "unknown_member_slug" });
      addId = a.rows[0].actor_id;
    }
    if (!addId) return res.status(400).json({ error: "invalid_body", message: "member_actor_id or member_slug required" });
    await pool.query(
      `INSERT INTO channel_members (channel_id, actor_id, role) VALUES ($1, $2, 'member') ON CONFLICT (channel_id, actor_id) DO NOTHING`,
      [req.params.channelId, addId],
    );
    res.json({ ok: true, member_actor_id: addId });
  });

  app.delete("/channels/:channelId/members/:removeActorId", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    if (!(await isChannelOwner(req.params.channelId, actorId))) {
      return res.status(403).json({ error: "forbidden", message: "Only the channel owner can remove members." });
    }
    const ch = await pool.query("SELECT owner_actor_id FROM channels WHERE channel_id = $1", [req.params.channelId]);
    if (!ch.rows[0]) return res.status(404).json({ error: "not_found" });
    if (ch.rows[0].owner_actor_id === req.params.removeActorId) {
      return res.status(400).json({ error: "cannot_remove_owner" });
    }
    await pool.query("DELETE FROM channel_e2e_wrapped_keys WHERE channel_id = $1 AND actor_id = $2", [
      req.params.channelId,
      req.params.removeActorId,
    ]);
    await pool.query("DELETE FROM channel_members WHERE channel_id = $1 AND actor_id = $2", [
      req.params.channelId,
      req.params.removeActorId,
    ]);
    res.json({ ok: true });
  });

  app.post("/channels/:channelId/invites", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    if (!(await isChannelOwner(req.params.channelId, actorId))) {
      return res.status(403).json({ error: "forbidden" });
    }
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const inviteId = `relay:invite:${randomBytes(16).toString("hex")}`;
    const { max_uses = 1, expires_in_hours } = (req.body as { max_uses?: number; expires_in_hours?: number }) || {};
    let expires: string | null = null;
    if (typeof expires_in_hours === "number" && expires_in_hours > 0) {
      expires = new Date(Date.now() + expires_in_hours * 3600_000).toISOString();
    }
    await pool.query(
      `INSERT INTO channel_invites (invite_id, channel_id, token_hash, created_by_actor_id, max_uses, use_count, expires_at)
       VALUES ($1,$2,$3,$4,$5,0,$6::timestamptz)`,
      [inviteId, req.params.channelId, tokenHash, actorId, Math.max(1, max_uses ?? 1), expires],
    );
    res.status(201).json({ invite_id: inviteId, token, message: "Send token to the invitee; they POST /channels/.../join on this same origin with X-Demo-Actor set to their user." });
  });

  app.post("/channels/:channelId/join", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    const { token } = req.body as { token?: string };
    if (!token) return res.status(400).json({ error: "token_required" });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const inv = await pool.query(
      `SELECT invite_id, channel_id, max_uses, use_count, expires_at FROM channel_invites WHERE token_hash = $1 AND channel_id = $2`,
      [tokenHash, req.params.channelId],
    );
    if (!inv.rows[0]) return res.status(400).json({ error: "invalid_token" });
    const row = inv.rows[0];
    if (row.expires_at && new Date(String(row.expires_at)) < new Date()) {
      return res.status(400).json({ error: "invite_expired" });
    }
    if (row.use_count >= row.max_uses) return res.status(400).json({ error: "invite_exhausted" });
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("UPDATE channel_invites SET use_count = use_count + 1 WHERE invite_id = $1", [row.invite_id]);
      await c.query(
        `INSERT INTO channel_members (channel_id, actor_id) VALUES ($1, $2) ON CONFLICT (channel_id, actor_id) DO NOTHING`,
        [req.params.channelId, actorId],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    res.json({ ok: true, channel_id: req.params.channelId, member_actor_id: actorId });
  });

  app.get("/channels/:channelId/members", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!(await canViewPrivateChannel(req.params.channelId, actorId))) {
      return res.status(403).json({ error: "forbidden", reason: "not_a_member" });
    }
    const ch = await pool.query("SELECT owner_actor_id FROM channels WHERE channel_id = $1", [req.params.channelId]);
    if (!ch.rows[0]) return res.status(404).json({ error: "not_found" });
    const ownerId = ch.rows[0].owner_actor_id as string;
    const ownerR = await pool.query("SELECT actor_id, slug FROM actors WHERE actor_id = $1", [ownerId]);
    const mem = await pool.query(
      `SELECT a.actor_id, a.slug FROM channel_members m JOIN actors a ON a.actor_id = m.actor_id
       WHERE m.channel_id = $1 ORDER BY a.slug`,
      [req.params.channelId],
    );
    res.json({ owner: ownerR.rows[0], members: mem.rows });
  });

  app.put("/channels/:channelId/e2e-wrapped-key", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    const m = await pool.query("SELECT 1 FROM channel_members WHERE channel_id = $1 AND actor_id = $2", [
      req.params.channelId,
      actorId,
    ]);
    if (!m.rows[0]) return res.status(403).json({ error: "forbidden", reason: "not_a_member" });
    const { wrapped_key_b64 } = req.body as { wrapped_key_b64?: string };
    if (!wrapped_key_b64) return res.status(400).json({ error: "wrapped_key_b64 required" });
    const buf = Buffer.from(wrapped_key_b64, "base64");
    if (buf.length < 16 || buf.length > 4096) return res.status(400).json({ error: "invalid_wrapped_key" });
    await pool.query(
      `INSERT INTO channel_e2e_wrapped_keys (channel_id, actor_id, wrapped_key) VALUES ($1, $2, $3)
       ON CONFLICT (channel_id, actor_id) DO UPDATE SET wrapped_key = EXCLUDED.wrapped_key, updated_at = NOW()`,
      [req.params.channelId, actorId, buf],
    );
    res.json({ ok: true });
  });

  app.get("/channels/:channelId/e2e-wrapped-key", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    const m = await pool.query("SELECT 1 FROM channel_members WHERE channel_id = $1 AND actor_id = $2", [
      req.params.channelId,
      actorId,
    ]);
    if (!m.rows[0]) return res.status(403).json({ error: "forbidden", reason: "not_a_member" });
    const r = await pool.query("SELECT wrapped_key FROM channel_e2e_wrapped_keys WHERE channel_id = $1 AND actor_id = $2", [
      req.params.channelId,
      actorId,
    ]);
    if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ wrapped_key_b64: (r.rows[0].wrapped_key as Buffer).toString("base64") });
  });

  app.post("/channels/:channelId/refs", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    const chv = await pool.query("SELECT COALESCE(visibility, 'public') AS visibility FROM channels WHERE channel_id = $1", [
      req.params.channelId,
    ]);
    if (!chv.rows[0]) return res.status(404).json({ error: "not_found" });
    if (chv.rows[0].visibility === "private" && !(await canViewPrivateChannel(req.params.channelId, actorId))) {
      return res.status(403).json({ error: "forbidden", message: "Private channel: members only." });
    }
    const { post_object_id, author_actor_id } = req.body as {
      post_object_id?: string;
      author_actor_id?: string;
    };
    if (!post_object_id || !author_actor_id) {
      return res.status(400).json({ error: "post_object_id and author_actor_id required" });
    }
    const refIns = await pool.query(
      "INSERT INTO channel_refs (channel_id, post_object_id, submitter_actor_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING channel_id",
      [req.params.channelId, post_object_id, actorId],
    );

    if (refIns.rowCount && refIns.rowCount > 0) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const head = await getLogHead(c, actorId);
        await appendLog(c, actorId, {
          actor: actorId,
          target: post_object_id,
          type: "channel.accept",
          ts: new Date().toISOString(),
          prev: head,
          data: { channel_id: req.params.channelId, post_object_id },
        });
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }

    void publishToRelay({
      topic: `channel:${req.params.channelId}`,
      envelope_kind: "channel_ref",
      payload: { channel_id: req.params.channelId, post_object_id, submitter_actor_id: actorId },
    });

    res.json({ ok: true });
  });

  app.get("/labels", async (req, res) => {
    const target = req.query.target as string | undefined;
    const channelId = req.query.channel_id as string | undefined;
    let q = "SELECT * FROM labels WHERE 1=1";
    const p: string[] = [];
    if (target) {
      p.push(target);
      q += ` AND target_object_id = $${p.length}`;
    }
    if (channelId) {
      p.push(channelId);
      q += ` AND channel_id = $${p.length}`;
    }
    q += " ORDER BY created_at DESC";
    const r = await pool.query(q, p);
    res.json(r.rows);
  });

  app.post("/labels", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    const { target_object_id, label, channel_id, notes } = req.body as {
      target_object_id?: string;
      label?: string;
      channel_id?: string;
      notes?: string;
    };
    if (!target_object_id || !label) return res.status(400).json({ error: "target_object_id and label required" });

    const now = new Date().toISOString();
    const label_id = `relay:label:${randomUUID().replace(/-/g, "")}`;
    const raw = {
      kind: "label",
      id: label_id,
      issuer_actor_id: actorId,
      target_object_id,
      label,
      channel_id,
      created_at: now,
      notes,
      signature: stubSignature(actorId, canonicalStringify({ target_object_id, label })),
    };

    await pool.query(
      `INSERT INTO labels (label_id, issuer_actor_id, target_object_id, label, scope, channel_id, notes, created_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::jsonb)`,
      [label_id, actorId, target_object_id, label, channel_id ? "channel" : "global", channel_id ?? null, notes ?? null, now, raw],
    );

    void publishToRelay({
      topic: channel_id ? `channel:${channel_id}` : `label:${target_object_id}`,
      envelope_kind: "label",
      payload: raw,
    });

    res.json(raw);
  });

  /**
   * Federation (vertical slice): record interest in a remote actor after allow-listing their origin in `federation_peers`
   * and resolving the peer via the same `GET /federation/resolve` flow.
   */
  app.post("/actors/:actorId/federation/remote-subscribe", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    if (actorId !== req.params.actorId) return res.status(403).json({ error: "actor_mismatch" });
    const { origin_url, followee_slug } = req.body as { origin_url?: string; followee_slug?: string };
    if (!origin_url?.trim() || !followee_slug?.trim()) {
      return res.status(400).json({ error: "origin_url and followee_slug required" });
    }
    const base = origin_url.replace(/\/$/, "");
    const allowed = await pool.query("SELECT 1 FROM federation_peers WHERE origin_url = $1", [base]);
    if (allowed.rowCount === 0) {
      return res.status(403).json({ error: "origin_not_trusted" });
    }
    const u = new URL("/actors", `${base}/`);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8_000);
    let remote: { actor_id: string; slug: string } | undefined;
    try {
      const r = await fetch(u, { signal: ac.signal });
      if (!r.ok) return res.status(502).json({ error: "remote_fetch_failed", status: r.status });
      const rows = (await r.json()) as Array<{ actor_id: string; slug: string }>;
      remote = rows.find((x) => x.slug.toLowerCase() === followee_slug.trim().toLowerCase());
    } catch (e) {
      return res.status(502).json({ error: "remote_unreachable", message: (e as Error).message });
    } finally {
      clearTimeout(t);
    }
    if (!remote) return res.status(404).json({ error: "actor_not_on_origin" });
    const now = new Date().toISOString();
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const head = await getLogHead(c, actorId);
      const ev = await appendLog(c, actorId, {
        actor: actorId,
        target: remote.actor_id,
        type: "membership.add",
        ts: now,
        prev: head,
        data: {
          kind: "federation_remote",
          origin: base,
          remote_slug: remote.slug,
          remote_actor_id: remote.actor_id,
        },
      });
      await c.query("COMMIT");
      res.json(ev);
    } catch (e) {
      await c.query("ROLLBACK");
      const err = e as { code?: string; head?: string | null };
      if (err.code === "log_prev_mismatch") {
        return res.status(409).json({ error: "log_prev_mismatch", head: err.head });
      }
      throw e;
    } finally {
      c.release();
    }
  });

  app.post("/trust/attest", async (req, res) => {
    const actorId = await resolveActor(req);
    if (!requireActor(actorId, res)) return;
    const { target_actor_id, level } = req.body as { target_actor_id?: string; level?: string };
    if (!target_actor_id) return res.status(400).json({ error: "target_actor_id required" });
    res.json({
      kind: "trust_attestation_stub",
      issuer: actorId,
      target_actor_id,
      level: level ?? "ok",
      ts: new Date().toISOString(),
      note: "MVP stub — replace with §6 attestation object + signature.",
    });
  });

  app.get("/indexer/snapshot", async (_req, res) => {
    res.json({
      note: "Indexer runs as separate service; this origin endpoint redirects clients to indexer URL in README.",
      transparency: "/indexer/policy on indexer port",
    });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[origin]", err);
    if (res.headersSent) return;
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: "internal_error",
      message,
      hint: message.includes("relation") || message.includes("does not exist") ? "Run pnpm db:migrate (and db:seed) against DATABASE_URL." : undefined,
    });
  });

  return app;
}
