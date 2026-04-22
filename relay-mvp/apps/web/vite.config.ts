import path from "node:path";
import type { ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite 6+ `client-inject`: with `server.middlewareMode` and `server.hmr: false`, the client
 * still gets HMR `port` default `24678` (nothing listens). The browser spams WebSocket errors.
 * When unified runs with hot reload off, stub the HMR transport's WebSocket so dev loads cleanly.
 * @see vite/dist/node/… `clientInjectionsPlugin` (middlewareMode && !isHmrServerSpecified → 24678)
 */
function relayUnifiedNoHmrWebsocketPlugin(): Plugin {
  const active = process.env.UNIFIED === "1" && process.env.UNIFIED_HMR !== "1";
  const re1 = new RegExp(
    [
      "createConnection: \\(\\) => new WebSocket\\(",
      "\\s*`\\$\\{socketProtocol\\}://\\$\\{socketHost\\}\\?token=\\$\\{wsToken\\}`,",
      '\\s*"vite-hmr"\\s*\\),',
    ].join(""),
  );
  const re2 = new RegExp(
    [
      "createConnection: \\(\\) => new WebSocket\\(",
      "\\s*`\\$\\{socketProtocol\\}://\\$\\{directSocketHost\\}\\?token=\\$\\{wsToken\\}`,",
      '\\s*"vite-hmr"\\s*\\),',
    ].join(""),
  );
  const replacement = "createConnection: () => __relayNoopHmrWebSocket(),";
  const helper = `function __relayNoopHmrWebSocket() {
  const s = { OPEN: 1, addEventListener() {}, send() {} };
  s.readyState = 1;
  s.close = () => {};
  s.url = "no-hmr";
  return s;
}
`;
  return {
    name: "relay-unified-no-hmr-websocket",
    apply: "serve",
    enforce: "post",
    transform(code, id) {
      if (!active) return null;
      const n = id.replace(/\\/g, "/");
      if (!n.includes("/vite/dist/client/client.mjs")) return null;
      let out = code.replace(re1, replacement).replace(re2, replacement);
      if (out === code) return null;
      out = out.replace('console.debug("[vite] connecting...");', "void 0;");
      return helper + out;
    },
  };
}

/** Second dev UIs: `MVP_VITE_PORT=5174 MVP_DEV_ORIGIN_PORT=3004 pnpm --filter @relay-mvp/web dev:peer` */
const originPort = process.env.MVP_DEV_ORIGIN_PORT ?? "3001";
const indexerPort = process.env.MVP_DEV_INDEXER_PORT ?? "3003";
const vitePort = Number(process.env.MVP_VITE_PORT ?? "5173");
/**
 * Unified dev: @relay-mvp/unified sets `MVP_VITE_HMR_PORT` to a *separate* port (HTTP port + 20000)
 * so the HMR WebSocket does not share `upgrade` with the relay `ws` on the main server.
 * Falls back to `vitePort` only if a dedicated HMR port was not set.
 */
const hmrClientPort = process.env.MVP_VITE_HMR_PORT ? Number(process.env.MVP_VITE_HMR_PORT) : vitePort;
/** Only when `UNIFIED_HMR=1` — default is off so mixed Express+relay+Vite does not spam failed HMR sockets. */
const unifiedHmrConfig =
  process.env.UNIFIED === "1" && process.env.UNIFIED_HMR === "1"
    ? {
        port: hmrClientPort,
        clientPort: hmrClientPort,
        host: "127.0.0.1" as const,
        protocol: "ws" as const,
      }
    : undefined;

function proxyErrorJson(upstream: string, startHint: string) {
  return (proxy: { on: (e: string, fn: (...args: unknown[]) => void) => void }) => {
    proxy.on("error", (err: Error, _req: unknown, res: unknown) => {
      const r = res as ServerResponse & { writeHead?: ServerResponse["writeHead"]; end?: ServerResponse["end"]; headersSent?: boolean };
      if (r && typeof r.writeHead === "function" && !r.headersSent) {
        r.writeHead(502, { "Content-Type": "application/json" });
        r.end(
          JSON.stringify({
            error: "proxy_upstream_unreachable",
            upstream,
            message: startHint,
            detail: err?.message ?? String(err),
          }),
        );
      }
    });
  };
}

export default defineConfig({
  plugins: [react(), relayUnifiedNoHmrWebsocketPlugin()],
  resolve: {
    alias: {
      "@relay-mvp/sdk": path.resolve(__dirname, "../../packages/sdk/src/index.ts"),
      "@relay-mvp/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      "@relay-mvp/protocol": path.resolve(__dirname, "../../packages/protocol/src/index.ts"),
    },
  },
  server: {
    port: vitePort,
    /** Bind IPv4 so `http://127.0.0.1:<port>` always matches the dev server. */
    host: "127.0.0.1",
    /**
     * If 5173 is in use, fail at startup instead of silently using 5174+ (which breaks
     * bookmarks to http://127.0.0.1:5173/). Free the port: `lsof -i :5173` then stop that process.
     */
    strictPort: true,
    /** Unified + `UNIFIED_HMR=1` only. Otherwise HMR is disabled in @relay-mvp/unified. */
    ...(unifiedHmrConfig ? { hmr: unifiedHmrConfig } : process.env.UNIFIED === "1" ? { hmr: false } : {}),
    proxy: {
      "/api/origin": {
        target: `http://127.0.0.1:${originPort}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/origin/, "") || "/",
        configure: proxyErrorJson(
          `origin (port ${originPort})`,
          "Start the origin: from relay-mvp run DATABASE_URL=… pnpm dev:origin or pnpm dev (full stack).",
        ),
      },
      "/api/indexer": {
        target: `http://127.0.0.1:${indexerPort}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/indexer/, "") || "/",
        configure: proxyErrorJson(
          `indexer (port ${indexerPort})`,
          "Start the indexer: pnpm dev:indexer or pnpm dev.",
        ),
      },
    },
  },
});
