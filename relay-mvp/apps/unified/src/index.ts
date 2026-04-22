/**
 * One process: origin + indexer + relay (HTTP + WebSocket) + Vite (React app).
 * Default http://127.0.0.1:5173 — same API paths as multi-process `pnpm dev` (via Vite proxy).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import express from "express";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { createApp } from "../../origin/src/createApp.js";
import { createIndexerApp } from "../../indexer/src/app.js";
import { createRelayService } from "../../relay/src/relayServer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mvpRoot = path.resolve(__dirname, "../../..");
const webRoot = path.join(mvpRoot, "apps", "web");

const envPath = path.join(mvpRoot, ".env");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const port = Number(process.env.UNIFIED_PORT ?? 5173);
/** So `apps/web/vite.config.ts` `server.port` matches the real HTTP port (not 5173). */
process.env.MVP_VITE_PORT = String(port);
/**
 * Separates Vite HMR (optional) from the relay `upgrade` path.
 * HMR is **opt-in** (`UNIFIED_HMR=1`); when off, the browser does not try failed HMR WebSockets. Override port: `UNIFIED_HMR_PORT=…` (default `UNIFIED_PORT + 20000`).
 */
const hmrPort = Number(process.env.UNIFIED_HMR_PORT) || port + 20_000;
const unifiedHmrEnabled = process.env.UNIFIED_HMR === "1";
if (unifiedHmrEnabled) {
  process.env.MVP_VITE_HMR_PORT = String(hmrPort);
}
if (!process.env.RELAY_INTERNAL_URL) {
  process.env.RELAY_INTERNAL_URL = `http://127.0.0.1:${port}/api/relay`;
}
process.env.VITE_RELAY_SAME_ORIGIN = process.env.VITE_RELAY_SAME_ORIGIN ?? "1";
process.env.UNIFIED = "1";

const SECRET = process.env.RELAY_INTERNAL_SECRET ?? "relay-dev-secret";
const { app: relayApp, attachToHttpServer } = createRelayService({
  secret: SECRET,
  wsPath: "/api/relay/ws",
});

const app = express();
app.use("/api/origin", createApp());
app.use("/api/indexer", createIndexerApp());
app.use("/api/relay", relayApp);

const httpServer = createServer(app);

/** HMR only if `UNIFIED_HMR=1` — its own `ws` port (not `httpServer`); see `MVP_VITE_HMR_PORT`. */
const vite = await createViteServer({
  configFile: path.join(webRoot, "vite.config.ts"),
  server: {
    middlewareMode: true,
    hmr: unifiedHmrEnabled ? { port: hmrPort, clientPort: hmrPort, host: "127.0.0.1" } : false,
  },
  appType: "custom",
  root: webRoot,
  envDir: webRoot,
});

app.use(vite.middlewares);
attachToHttpServer(httpServer);
app.get("/*", async (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  try {
    const url = req.originalUrl || "/";
    const template = readFileSync(path.join(webRoot, "index.html"), "utf-8");
    const html = await vite.transformIndexHtml(url, template);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    next(e);
  }
});

httpServer.listen(port, "127.0.0.1", () => {
  const hmrLine = unifiedHmrEnabled
    ? `  ·  Vite HMR: ws://127.0.0.1:${hmrPort} (override UNIFIED_HMR_PORT; unset UNIFIED_HMR to disable hot reload)`
    : `  ·  Vite HMR: off (set UNIFIED_HMR=1 and restart for hot reload)`;
  console.log(
    `Unified Relay MVP: http://127.0.0.1:${port}  ·  relay: ws://127.0.0.1:${port}/api/relay/ws${hmrLine}`,
  );
});
