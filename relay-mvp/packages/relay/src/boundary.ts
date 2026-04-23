/**
 * v2 Boundary canonical form (§0.6.1) for comparison and hashing.
 * @see Relay-Stack-Spec-v2.md §0.6, §0.6.1
 */
import { canonicalStringify } from "@relay-mvp/protocol";
import type { BoundaryV2 } from "./types.js";

/** Sort JSON string array values lexicographically (NFC assumed by caller). */
function sortStringArray(a: string[] | undefined): string[] | undefined {
  if (!a) return undefined;
  return [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

/**
 * Canonically order `event_ranges`: UTF-8 byte order of actor, then from, then to.
 * Array order is not semantically significant (product of windows).
 */
function canonicalEventRanges(
  ranges: NonNullable<BoundaryV2["event_ranges"]>
): NonNullable<BoundaryV2["event_ranges"]> {
  return [...ranges]
    .map((r) => ({ actor: r.actor, from: r.from, to: r.to }))
    .sort((a, b) => {
      if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
      if (a.from !== b.from) return a.from < b.from ? -1 : 1;
      if (a.to !== b.to) return a.to < b.to ? -1 : 1;
      return 0;
    });
}

/**
 * Build a canonical Boundary object: sorted keys (via canonicalStringify), sorted filter arrays.
 * Optional keys with no value MUST be omitted (§0.6.1).
 */
export function canonicalBoundary(b: BoundaryV2): BoundaryV2 {
  const out: BoundaryV2 = {};
  if (b.snapshot !== undefined) out.snapshot = b.snapshot;

  if (b.event_ranges !== undefined && b.event_ranges.length > 0) {
    out.event_ranges = canonicalEventRanges(b.event_ranges);
  }

  if (b.state_scope !== undefined) {
    const ss = b.state_scope;
    out.state_scope = {};
    if (ss.actors !== undefined && ss.actors.length > 0) {
      out.state_scope.actors = sortStringArray(ss.actors)!;
    }
    if (ss.types !== undefined && ss.types.length > 0) {
      out.state_scope.types = sortStringArray(ss.types)!;
    }
    if (ss.id_range !== undefined) {
      out.state_scope.id_range = { from: ss.id_range.from, to: ss.id_range.to };
    }
    if (Object.keys(out.state_scope).length === 0) delete out.state_scope;
  }

  if (b.id_range !== undefined) {
    out.id_range = { from: b.id_range.from, to: b.id_range.to };
  }

  return out;
}

/** Deterministic JSON string for equality / caching (§0.6.1 + §4.1 key order). */
export function boundaryCanonicalString(b: BoundaryV2): string {
  return canonicalStringify(canonicalBoundary(b));
}

/**
 * Static validation: Boundary must include at least one finite pin (§0.6 (1)–(3))
 * for deterministic evaluation.
 */
export function boundaryHasFinitePin(b: BoundaryV2): boolean {
  const c = canonicalBoundary(b);
  if (c.snapshot !== undefined && c.snapshot.length > 0) return true;
  if (c.event_ranges !== undefined && c.event_ranges.length > 0) return true;
  if (c.id_range !== undefined && c.id_range.from.length > 0 && c.id_range.to.length > 0) {
    return true;
  }
  if (c.state_scope?.id_range !== undefined) return true;
  return false;
}
