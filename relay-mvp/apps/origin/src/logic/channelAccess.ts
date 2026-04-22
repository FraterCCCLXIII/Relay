import { pool } from "../db.js";

export async function canViewPrivateChannel(channelId: string, actorId: string | null): Promise<boolean> {
  const ch = await pool.query<{ owner_actor_id: string; visibility: string }>(
    "SELECT owner_actor_id, COALESCE(visibility, 'public') AS visibility FROM channels WHERE channel_id = $1",
    [channelId],
  );
  if (!ch.rows[0]) return false;
  if (ch.rows[0].visibility !== "private") return true;
  if (!actorId) return false;
  if (ch.rows[0].owner_actor_id === actorId) return true;
  const m = await pool.query("SELECT 1 FROM channel_members WHERE channel_id = $1 AND actor_id = $2", [
    channelId,
    actorId,
  ]);
  return (m.rowCount ?? 0) > 0;
}

export async function isChannelOwner(channelId: string, actorId: string): Promise<boolean> {
  const ch = await pool.query<{ owner_actor_id: string }>("SELECT owner_actor_id FROM channels WHERE channel_id = $1", [
    channelId,
  ]);
  return !!ch.rows[0] && ch.rows[0].owner_actor_id === actorId;
}
