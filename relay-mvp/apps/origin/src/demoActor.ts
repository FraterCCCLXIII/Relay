import type { Request } from "express";
import { pool } from "./db.js";

/** MVP: map X-Demo-Actor slug header to actor_id. Not a security model. */
export async function resolveDemoActor(req: Request): Promise<string | null> {
  const slug = req.header("x-demo-actor")?.trim().toLowerCase();
  if (!slug) return null;
  const r = await pool.query<{ actor_id: string }>(
    "SELECT actor_id FROM actors WHERE slug = $1",
    [slug],
  );
  return r.rows[0]?.actor_id ?? null;
}

export function requireActor(actorId: string | null, res: import("express").Response): actorId is string {
  if (!actorId) {
    res.status(401).json({ error: "missing_x_demo_actor", message: "Set X-Demo-Actor header to a seeded slug (alice, bob, mod)." });
    return false;
  }
  return true;
}
