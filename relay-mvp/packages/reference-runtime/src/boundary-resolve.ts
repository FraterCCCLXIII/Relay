import { eventsInRangeInclusive } from "@relay-mvp/relay";
import type { BoundaryV2, RelayEventV1 } from "@relay-mvp/relay";
import { forwardLogFromHead } from "./log-order.js";
import type { ReferenceStorage } from "./storage.js";

/**
 * Resolve `event_ranges` to a merged event list (§0.6.1 per-actor windows).
 * Dedupes by event id; order is not total across actors — reducer applies §17.10 merge.
 */
export function collectEventsForEventRanges(
  store: ReferenceStorage,
  boundary: BoundaryV2
): RelayEventV1[] {
  const er = boundary.event_ranges;
  if (!er?.length) return [];
  const byId = new Map<string, RelayEventV1>();
  for (const r of er) {
    const log = forwardLogFromHead(store, r.actor);
    const slice = eventsInRangeInclusive(log, r.from, r.to);
    for (const e of slice) {
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
  }
  return [...byId.values()];
}
