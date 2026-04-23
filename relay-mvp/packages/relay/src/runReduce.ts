/**
 * Pure reduce execution on resolved inputs (§0.6, §17.10, §11.1).
 * @see Relay-Stack-Spec-v2.md §0.6, §17.10
 */
import { reduceChronological, reduceReverseChronological } from "./reducers.js";
import type { FeedDefinitionStateV1, RelayEventV1 } from "./types.js";

export type ReduceOutput = { event_ids: string[] };

/**
 * Run feed definition reducer over pre-fetched events (no I/O).
 * Unknown `reduce` → error (§22.4 degrade: caller may catch).
 */
export function runFeedReduce(
  definition: FeedDefinitionStateV1,
  events: RelayEventV1[]
): ReduceOutput {
  const r = definition.payload.reduce;
  if (r === "relay.reduce.chronological.v1") {
    return { event_ids: reduceChronological(events) };
  }
  if (r === "relay.reduce.reverse_chronological.v1") {
    return { event_ids: reduceReverseChronological(events) };
  }
  throw new Error(`reduce_not_implemented:${r}`);
}
