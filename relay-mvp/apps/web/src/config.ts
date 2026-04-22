/**
 * API bases for the MVP.
 * In dev, defaults use Vite proxies (same-origin) so fetches never hit the SPA `index.html` by mistake.
 * Set VITE_* only if you need to talk to another host explicitly.
 */
function readUrl(key: string, devDefault: string, prodDefault: string): string {
  const raw = import.meta.env[key];
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length > 0 && s !== "undefined") return s.replace(/\/$/, "");
  return import.meta.env.DEV ? devDefault : prodDefault;
}

/** Origin HTTP API (actors, state, log, feed, channels, labels) */
export const ORIGIN_URL = readUrl("VITE_ORIGIN_URL", "/api/origin", "http://127.0.0.1:3001");
/** Indexer transparency JSON */
export const INDEXER_URL = readUrl("VITE_INDEXER_URL", "/api/indexer", "http://127.0.0.1:3003");
/** WebSocket relay (no proxy by default; must match relay server) */
export const RELAY_WS = readUrl("VITE_RELAY_WS", "ws://127.0.0.1:3002/ws", "ws://127.0.0.1:3002/ws");
