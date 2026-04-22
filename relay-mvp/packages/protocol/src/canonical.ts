/**
 * Canonical JSON for stable hashing (Relay §4.1 subset).
 * Keys sorted lexicographically; no insignificant whitespace.
 * MVP: does not implement full §4.1.1 number rules — we use integers + strings only in payloads.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = sortKeys(obj[k]);
  }
  return out;
}
