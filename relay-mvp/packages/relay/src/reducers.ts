/**
 * Required reducers (§17.10).
 * @see Relay-Stack-Spec-v2.md §17.10; Relay-Stack-Spec-v1-4-1.md §17.10
 */
import type { RelayEventV1 } from "./types.js";

function compareTsThenId(a: RelayEventV1, b: RelayEventV1): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * `relay.reduce.chronological.v1`: union of event sets, dedupe by id, sort earliest first by (ts, event_id).
 */
export function reduceChronological(eventList: RelayEventV1[]): string[] {
  const byId = new Map<string, RelayEventV1>();
  for (const e of eventList) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  const arr = [...byId.values()].sort(compareTsThenId);
  return arr.map((e) => e.id);
}

/** `relay.reduce.reverse_chronological.v1`: chronological then reverse (§17.10). */
export function reduceReverseChronological(eventList: RelayEventV1[]): string[] {
  return [...reduceChronological(eventList)].reverse();
}
