import type { Response } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "../db.js";
import { SESSION_COOKIE } from "../demoActor.js";

const defaultMaxAge = 7 * 24 * 3600;

/**
 * Create a new row in `auth_sessions` and set the `relay_session` cookie.
 */
export async function createRelayWebSession(
  res: Response,
  actorId: string,
  maxAgeSec: number = defaultMaxAge,
): Promise<{ sessionId: string; maxAge: number }> {
  const sessionId = randomBytes(32).toString("hex");
  const maxAge = maxAgeSec;
  const expires = new Date(Date.now() + maxAge * 1000);
  await pool.query("INSERT INTO auth_sessions (session_id, actor_id, expires_at) VALUES ($1, $2, $3::timestamptz)", [
    sessionId,
    actorId,
    expires.toISOString(),
  ]);
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${sessionId}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`);
  return { sessionId, maxAge };
}

export function clearRelaySessionCookie(res: Response) {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}
