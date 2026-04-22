import { canonicalStringify, eventIdFromPayload, stubSignature, type LogEventEnvelope } from "@relay-mvp/protocol";
import type { PoolClient } from "pg";
import { publishToRelay } from "../relayPublish.js";

export async function getLogHead(client: PoolClient, actorId: string): Promise<string | null> {
  const r = await client.query<{ event_id: string }>(
    "SELECT event_id FROM log_events WHERE actor_id = $1 ORDER BY seq DESC LIMIT 1",
    [actorId],
  );
  return r.rows[0]?.event_id ?? null;
}

export async function appendLog(
  client: PoolClient,
  actorId: string,
  partial: Omit<LogEventEnvelope, "kind" | "event_id"> & { prev: string | null },
): Promise<LogEventEnvelope> {
  const head = await getLogHead(client, actorId);
  if (partial.prev !== head) {
    const err = new Error("log_prev_mismatch") as Error & { code: string; head: string | null };
    err.code = "log_prev_mismatch";
    err.head = head;
    throw err;
  }

  const envelopeCore = {
    kind: "log" as const,
    actor: actorId,
    target: partial.target,
    type: partial.type,
    ts: partial.ts,
    prev: partial.prev,
    data: partial.data,
  };
  const eventId = eventIdFromPayload(canonicalStringify(envelopeCore));
  const sig = partial.signature ?? stubSignature(actorId, canonicalStringify(envelopeCore));
  const full: LogEventEnvelope = { ...envelopeCore, event_id: eventId, signature: sig };

  await client.query(
    `INSERT INTO log_events (event_id, actor_id, target, type, ts, prev, data, signature, raw)
     VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7::jsonb,$8,$9::jsonb)`,
    [
      full.event_id,
      actorId,
      full.target ?? null,
      full.type,
      full.ts,
      full.prev,
      JSON.stringify(full.data),
      full.signature ?? null,
      JSON.stringify(full),
    ],
  );

  void publishToRelay({
    topic: `actor:${actorId}`,
    envelope_kind: "log",
    payload: full,
  });

  return full;
}
