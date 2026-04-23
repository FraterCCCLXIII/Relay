import type { RelayEventV1, RelaySnapshotV1, RelayStateV1 } from "@relay-mvp/relay";
import Database from "better-sqlite3";
import type { ReferenceStorage } from "./storage.js";

/**
 * SQLite-backed storage for dual-runtime tests (Node only).
 */
export class SqliteStorage implements ReferenceStorage {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS actor_heads (actor TEXT PRIMARY KEY, head TEXT);
      CREATE TABLE IF NOT EXISTS states (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, json TEXT NOT NULL, members_json TEXT NOT NULL);
    `);
  }

  close(): void {
    this.db.close();
  }

  putEvent(ev: RelayEventV1): void {
    this.db.prepare("INSERT OR REPLACE INTO events (id, json) VALUES (?, ?)").run(ev.id, JSON.stringify(ev));
  }

  getEvent(id: string): RelayEventV1 | undefined {
    const row = this.db.prepare("SELECT json FROM events WHERE id = ?").get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as RelayEventV1) : undefined;
  }

  listEventsByActor(actor: string): RelayEventV1[] {
    const rows = this.db.prepare("SELECT json FROM events").all() as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as RelayEventV1).filter((e) => e.actor === actor);
  }

  getActorHead(actor: string): string | null {
    const row = this.db.prepare("SELECT head FROM actor_heads WHERE actor = ?").get(actor) as
      | { head: string | null }
      | undefined;
    if (!row) return null;
    return row.head;
  }

  setActorHead(actor: string, head: string | null): void {
    this.db
      .prepare("INSERT OR REPLACE INTO actor_heads (actor, head) VALUES (?, ?)")
      .run(actor, head);
  }

  putState(st: RelayStateV1): void {
    this.db.prepare("INSERT OR REPLACE INTO states (id, json) VALUES (?, ?)").run(st.id, JSON.stringify(st));
  }

  getState(id: string): RelayStateV1 | undefined {
    const row = this.db.prepare("SELECT json FROM states WHERE id = ?").get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as RelayStateV1) : undefined;
  }

  allStateIds(): string[] {
    return (this.db.prepare("SELECT id FROM states").all() as { id: string }[]).map((r) => r.id);
  }

  putSnapshot(meta: RelaySnapshotV1, memberStates: RelayStateV1[]): void {
    this.db
      .prepare("INSERT OR REPLACE INTO snapshots (id, json, members_json) VALUES (?, ?, ?)")
      .run(meta.id, JSON.stringify(meta), JSON.stringify(memberStates));
  }

  getSnapshot(
    id: string
  ): { meta: RelaySnapshotV1; members: RelayStateV1[] } | undefined {
    const row = this.db
      .prepare("SELECT json, members_json FROM snapshots WHERE id = ?")
      .get(id) as { json: string; members_json: string } | undefined;
    if (!row) return undefined;
    return {
      meta: JSON.parse(row.json) as RelaySnapshotV1,
      members: JSON.parse(row.members_json) as RelayStateV1[]
    };
  }
}
