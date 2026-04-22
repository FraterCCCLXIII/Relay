import type { Express, Request } from "express";
import { randomBytes } from "node:crypto";
import * as oidc from "openid-client";
import { pool } from "../db.js";
import { createRelayWebSession } from "./webSession.js";
import { hashPassword, verifyPassword } from "./passwordHash.js";
import { insertNewActor, validateEmail, validateSlug } from "./actorProvision.js";

const PROVIDER = "google";

type PendingOauth = {
  codeVerifier: string;
  state: string;
  nonce: string;
  returnTo: string;
  exp: number;
};

const pending = new Map<string, PendingOauth>();
const PENDING_TTL_MS = 15 * 60 * 1000;

function cleanupPending() {
  const t = Date.now();
  for (const [k, v] of pending) {
    if (v.exp < t) pending.delete(k);
  }
}

let googleConfigCache: oidc.Configuration | null = null;

function googleEnvOk(): boolean {
  return !!(process.env.RELAY_MVP_OAUTH_GOOGLE_ID?.trim() && process.env.RELAY_MVP_OAUTH_GOOGLE_SECRET?.trim());
}

async function getGoogleConfig(): Promise<oidc.Configuration | null> {
  if (!googleEnvOk()) return null;
  if (googleConfigCache) return googleConfigCache;
  const id = process.env.RELAY_MVP_OAUTH_GOOGLE_ID!.trim();
  const secret = process.env.RELAY_MVP_OAUTH_GOOGLE_SECRET!.trim();
  googleConfigCache = await oidc.discovery(new URL("https://accounts.google.com"), id, secret);
  return googleConfigCache;
}

function callbackUrlFromEnvOrThrow(): string {
  const u = process.env.RELAY_MVP_OAUTH_GOOGLE_CALLBACK_URL?.trim();
  if (!u) {
    throw new Error("Missing RELAY_MVP_OAUTH_GOOGLE_CALLBACK_URL (must match Google Cloud console).");
  }
  return u.replace(/\/$/, "");
}

function defaultSlugFromEmail(email: string): string {
  const local = email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = `${(local.slice(0, 20) || "user")}_${randomBytes(2).toString("hex")}`;
  return base.slice(0, 32);
}

function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw.slice(0, 256);
}

function buildPublicUrl(req: Request): URL {
  const host = req.get("host") || "127.0.0.1";
  const proto = (req.get("x-forwarded-proto") as string) || (req as Request & { protocol?: string }).protocol || "http";
  return new URL(req.originalUrl, `${proto}://${host}`);
}

export function addFullAuthRoutes(app: Express) {
  app.get("/auth/providers", async (_req, res) => {
    res.json({ local: true, google: (await getGoogleConfig().catch(() => null)) !== null && googleEnvOk() });
  });

  app.post("/auth/register", async (req, res) => {
    const b = req.body as { email?: string; password?: string; slug?: string; displayName?: string };
    const e = typeof b.email === "string" ? b.email : "";
    const p = typeof b.password === "string" ? b.password : "";
    if (!e || p.length < 8) {
      return res.status(400).json({ error: "invalid_body", message: "email and password (min 8 chars) required" });
    }
    if (validateEmail(e) !== true) return res.status(400).json({ error: "invalid_email" });
    const sl = typeof b.slug === "string" ? b.slug : "";
    const sv = validateSlug(sl);
    if (sv !== true) return res.status(400).json({ error: "invalid_slug", message: sv.error });
    const display = (typeof b.displayName === "string" && b.displayName.trim()) || sl || "user";

    const em = e.trim().toLowerCase();
    const existing = await pool.query("SELECT 1 FROM local_accounts WHERE email = $1", [em]);
    if (existing.rows[0]) return res.status(409).json({ error: "email_taken" });

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const a = await insertNewActor(c, sl, display);
      const ph = await hashPassword(p);
      await c.query("INSERT INTO local_accounts (email, password_hash, actor_id) VALUES ($1, $2, $3)", [em, ph, a.actor_id]);
      await c.query("COMMIT");
      await createRelayWebSession(res, a.actor_id);
      res.json({ ok: true, actor_id: a.actor_id, slug: a.slug });
    } catch (err) {
      try {
        await c.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      if (err instanceof Error && err.message === "slug_taken") {
        return res.status(409).json({ error: "slug_taken" });
      }
      console.error("register", err);
      return res.status(500).json({ error: "register_failed" });
    } finally {
      c.release();
    }
  });

  app.post("/auth/login-password", async (req, res) => {
    const b = req.body as { email?: string; password?: string };
    const e = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const p = typeof b.password === "string" ? b.password : "";
    if (!e || !p) return res.status(400).json({ error: "invalid_body" });
    const r = await pool.query<{ actor_id: string; password_hash: string }>(
      "SELECT la.actor_id, la.password_hash FROM local_accounts la WHERE la.email = $1",
      [e],
    );
    if (!r.rows[0]) return res.status(401).json({ error: "invalid_credentials" });
    const row = r.rows[0]!;
    const v = await verifyPassword(p, row.password_hash);
    if (!v) return res.status(401).json({ error: "invalid_credentials" });
    const slugR = await pool.query<{ slug: string }>("SELECT slug FROM actors WHERE actor_id = $1", [row.actor_id]);
    await createRelayWebSession(res, row.actor_id);
    res.json({ ok: true, actor_id: row.actor_id, slug: slugR.rows[0]?.slug });
  });

  app.get("/auth/oauth/google", async (req, res) => {
    const cfg = await getGoogleConfig();
    if (!cfg) return res.status(501).json({ error: "google_oauth_not_configured" });
    let redirectUri: string;
    try {
      redirectUri = callbackUrlFromEnvOrThrow();
    } catch {
      return res.status(501).json({ error: "google_oauth_callback_url_missing" });
    }
    cleanupPending();
    const returnTo = safeReturnTo(req.query.return_to);
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    pending.set(state, { codeVerifier, state, nonce, returnTo, exp: Date.now() + PENDING_TTL_MS });
    const u = oidc.buildAuthorizationUrl(cfg, {
      redirect_uri: redirectUri,
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });
    return res.redirect(302, u.href);
  });

  app.get("/auth/oauth/google/callback", async (req, res) => {
    const cfg = await getGoogleConfig();
    if (!cfg) return res.status(501).json({ error: "google_oauth_not_configured" });
    try {
      callbackUrlFromEnvOrThrow();
    } catch {
      return res.status(501).json({ error: "google_oauth_callback_url_missing" });
    }
    cleanupPending();
    const stateQ = typeof req.query.state === "string" ? req.query.state : "";
    const pend = pending.get(stateQ);
    if (stateQ) pending.delete(stateQ);
    if (!pend) return res.status(400).json({ error: "oauth_state_invalid" });

    const fullUrl = buildPublicUrl(req);
    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(cfg, fullUrl, {
        pkceCodeVerifier: pend.codeVerifier,
        expectedState: pend.state,
        expectedNonce: pend.nonce,
      });
    } catch (e) {
      console.error("authorizationCodeGrant", e);
      return res.status(400).json({ error: "oauth_code_exchange_failed" });
    }

    const cTok = tokens.claims() as { sub?: string; email?: string } | undefined;
    const sub = cTok?.sub;
    const email = typeof cTok?.email === "string" ? cTok.email.toLowerCase() : null;
    if (!sub) return res.status(400).json({ error: "no_sub" });

    const existingOauth = await pool.query<{ actor_id: string }>(
      "SELECT actor_id FROM oauth_accounts WHERE provider = $1 AND provider_sub = $2",
      [PROVIDER, sub],
    );
    if (existingOauth.rows[0]) {
      await createRelayWebSession(res, existingOauth.rows[0]!.actor_id);
      return res.redirect(302, pend.returnTo);
    }

    if (email) {
      const local = await pool.query<{ actor_id: string }>("SELECT actor_id FROM local_accounts WHERE email = $1", [email]);
      if (local.rows[0]) {
        const aid = local.rows[0]!.actor_id;
        await pool.query("INSERT INTO oauth_accounts (provider, provider_sub, email, actor_id) VALUES ($1, $2, $3, $4)", [
          PROVIDER,
          sub,
          email,
          aid,
        ]);
        await createRelayWebSession(res, aid);
        return res.redirect(302, pend.returnTo);
      }
    }

    const c = await pool.connect();
    for (let attempt = 0; attempt < 6; attempt++) {
      const slug = attempt === 0 ? defaultSlugFromEmail(email || `u-${sub}.local`) : defaultSlugFromEmail(`retry${attempt}@local.test`);
      try {
        await c.query("BEGIN");
        const a = await insertNewActor(c, slug, email?.split("@")[0] || "user");
        await c.query("INSERT INTO oauth_accounts (provider, provider_sub, email, actor_id) VALUES ($1, $2, $3, $4)", [
          PROVIDER,
          sub,
          email,
          a.actor_id,
        ]);
        await c.query("COMMIT");
        c.release();
        await createRelayWebSession(res, a.actor_id);
        return res.redirect(302, pend.returnTo);
      } catch (e) {
        try {
          await c.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        if (e instanceof Error && e.message === "slug_taken") continue;
        c.release();
        console.error("oauth new user", e);
        return res.status(500).json({ error: "oauth_persist_failed" });
      }
    }
    c.release();
    return res.status(500).json({ error: "slug_exhausted" });
  });
}
