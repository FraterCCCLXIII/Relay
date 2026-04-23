/**
 * Pure event chain operations (§0.1, §10 prev chain); no storage.
 * @see Relay-Stack-Spec-v2.md §0.1, Part I §10.1
 */
import type { RelayEventV1 } from "./types.js";

/** Walk from `head` backward along `prev` until genesis or missing parent. */
export function walkChainBackward(
  headId: string,
  byId: Map<string, RelayEventV1>
): { chain: RelayEventV1[]; unresolvedPrev: string[] } {
  const chain: RelayEventV1[] = [];
  const unresolvedPrev: string[] = [];
  let cur: string | null = headId;
  const seen = new Set<string>();
  while (cur !== null) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const ev = byId.get(cur);
    if (!ev) {
      unresolvedPrev.push(cur);
      break;
    }
    chain.push(ev);
    cur = ev.prev;
  }
  return { chain, unresolvedPrev };
}

/** Collect all events reachable as `prev` from heads (for range checks). */
export function eventsInRangeInclusive(
  orderedLog: RelayEventV1[],
  fromId: string,
  toId: string
): RelayEventV1[] {
  const idxFrom = orderedLog.findIndex((e) => e.id === fromId);
  const idxTo = orderedLog.findIndex((e) => e.id === toId);
  if (idxFrom < 0 || idxTo < 0) throw new Error("event_range_endpoint_not_in_log");
  if (idxFrom > idxTo) throw new Error("event_range_inverted");
  return orderedLog.slice(idxFrom, idxTo + 1);
}
