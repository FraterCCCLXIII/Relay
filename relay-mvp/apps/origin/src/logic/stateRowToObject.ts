import type { StateObject } from "@relay-mvp/protocol";

export function stateRowToObject(row: {
  object_id: string;
  actor_id: string;
  schema: string;
  version: number;
  storage_class: string;
  content_class: string;
  deleted: boolean;
  payload: unknown;
  signature: string | null;
  created_at: Date;
  updated_at: Date;
}): StateObject {
  return {
    kind: "state",
    object_id: row.object_id,
    actor_id: row.actor_id,
    schema: row.schema,
    version: row.version,
    storage_class: row.storage_class as StateObject["storage_class"],
    content_class: row.content_class as StateObject["content_class"],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted: row.deleted,
    payload: row.payload as Record<string, unknown>,
    signature: row.signature ?? undefined,
  };
}
