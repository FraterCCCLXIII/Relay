import type { RelayEventV1 } from "@relay-mvp/relay";
import type { ReferenceStorage } from "./storage.js";

/**
 * Build actor log in forward order (genesis → head) from current head pointer (§10 `prev` chain).
 */
export function forwardLogFromHead(store: ReferenceStorage, actor: string): RelayEventV1[] {
  const head = store.getActorHead(actor);
  if (!head) return [];
  const rev: RelayEventV1[] = [];
  let cur: string | null = head;
  const seen = new Set<string>();
  while (cur !== null) {
    if (seen.has(cur)) throw new Error("log_cycle");
    seen.add(cur);
    const ev = store.getEvent(cur);
    if (!ev) break;
    if (ev.actor !== actor) throw new Error("actor_mismatch");
    rev.push(ev);
    cur = ev.prev;
  }
  return rev.reverse();
}

/**
 * List head event ids (events never referenced as `prev`) — §5.3 / §17.10 fork detection.
 */
export function listHeadsForActor(store: ReferenceStorage, actor: string): string[] {
  const evs = store.listEventsByActor(actor);
  const referenced = new Set<string>();
  for (const e of evs) {
    if (e.prev) referenced.add(e.prev);
  }
  return evs.map((e) => e.id).filter((id) => !referenced.has(id));
}
