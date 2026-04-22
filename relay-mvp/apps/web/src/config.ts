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

function defaultRelayWs(): string {
  if (import.meta.env.VITE_RELAY_SAME_ORIGIN === "1" && typeof globalThis !== "undefined" && "location" in globalThis) {
    const { protocol, host } = (globalThis as { location: { protocol: string; host: string } }).location;
    const wsProto = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${host}/api/relay/ws`;
  }
  return "ws://127.0.0.1:3002/ws";
}

/** WebSocket relay — separate relay process on :3002, or /api/relay/ws in `pnpm --filter @relay-mvp/unified dev` */
export const RELAY_WS = readUrl("VITE_RELAY_WS", defaultRelayWs(), "ws://127.0.0.1:3002/ws");
