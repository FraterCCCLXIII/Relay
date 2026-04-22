import type { Request } from "express";
import { pool } from "./db.js";

const SESSION_COOKIE = "relay_session";

function parseCookie(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function getSessionIdFromRequest(req: Request): string | undefined {
  return parseCookie(req.headers.cookie)[SESSION_COOKIE];
}

/**
 * When `RELAY_MVP_DEMO_ACTOR=0` (or `false` / `off`), the `X-Demo-Actor` header is not accepted.
 * Session cookies still work.
 */
export function demoHeaderAllowed(): boolean {
  const v = process.env.RELAY_MVP_DEMO_ACTOR?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

/** Map X-Demo-Actor slug to actor_id (dev / demo). */
export async function resolveDemoActor(req: Request): Promise<string | null> {
  if (!demoHeaderAllowed()) return null;
  const slug = req.header("x-demo-actor")?.trim().toLowerCase();
  if (!slug) return null;
  const r = await pool.query<{ actor_id: string }>(
    "SELECT actor_id FROM actors WHERE slug = $1",
    [slug],
  );
  return r.rows[0]?.actor_id ?? null;
}

export async function resolveSessionActor(req: Request): Promise<string | null> {
  const sid = getSessionIdFromRequest(req);
  if (!sid) return null;
  const r = await pool.query<{ actor_id: string }>(
    "SELECT actor_id FROM auth_sessions WHERE session_id = $1 AND expires_at > NOW()",
    [sid],
  );
  return r.rows[0]?.actor_id ?? null;
}

/**
 * Resolves the caller actor: cookie session first, else optional X-Demo-Actor when allowed.
 */
export async function resolveActor(req: Request): Promise<string | null> {
  const fromSession = await resolveSessionActor(req);
  if (fromSession) return fromSession;
  return resolveDemoActor(req);
}

export function requireActor(actorId: string | null, res: import("express").Response): actorId is string {
  if (!actorId) {
    res.status(401).json({
      error: "unauthorized",
      message:
        "Sign in (POST /auth/login with { slug }) or set X-Demo-Actor to a seeded slug when demo headers are enabled (RELAY_MVP_DEMO_ACTOR not 0).",
    });
    return false;
  }
  return true;
}

export { SESSION_COOKIE };
