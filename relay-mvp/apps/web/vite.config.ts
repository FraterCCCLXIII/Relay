import path from "node:path";
import type { ServerResponse } from "node:http";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [react()],
  resolve: {
    alias: {
      "@relay-mvp/sdk": path.resolve(__dirname, "../../packages/sdk/src/index.ts"),
      "@relay-mvp/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      "@relay-mvp/protocol": path.resolve(__dirname, "../../packages/protocol/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/origin": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/origin/, "") || "/",
        configure: proxyErrorJson(
          "origin (port 3001)",
          "Start the origin: from relay-mvp run DATABASE_URL=… pnpm dev:origin or pnpm dev (full stack).",
        ),
      },
      "/api/indexer": {
        target: "http://127.0.0.1:3003",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/indexer/, "") || "/",
        configure: proxyErrorJson(
          "indexer (port 3003)",
          "Start the indexer: pnpm dev:indexer or pnpm dev.",
        ),
      },
    },
  },
});
