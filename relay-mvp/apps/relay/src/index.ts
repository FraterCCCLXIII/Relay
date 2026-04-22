/**
 * Fast Relay — acceleration only (§3). Origin remains source of truth.
 * MVP: no signature verification on PUB; demo HELLO only.
 */
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { RelayClientMessage, RelayServerMessage } from "@relay-mvp/protocol";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.RELAY_PORT ?? 3002);
const SECRET = process.env.RELAY_INTERNAL_SECRET ?? "relay-dev-secret";

type Client = {
  ws: import("ws").WebSocket;
  subscriptions: Set<string>;
  actorId?: string;
};

const clients = new Set<Client>();

function broadcast(topic: string, envelope_kind: "state" | "log" | "label" | "channel_ref", payload: unknown): void {
  const msg: RelayServerMessage = {
    type: "EVENT",
    source: "relay",
    topic,
    envelope_kind,
    payload,
  };
  const raw = JSON.stringify(msg);
  for (const c of clients) {
    if ([...c.subscriptions].some((s) => topicMatches(s, topic))) {
      if (c.ws.readyState === 1) c.ws.send(raw);
    }
  }
}

/** Subscription "actor:ID" matches topic "actor:ID"; "channel:ID" matches. */
function topicMatches(sub: string, topic: string): boolean {
  if (sub === topic) return true;
  if (sub === "global" || sub === "*") return true;
  return false;
}

const app = express();
app.use(express.json());

app.post("/internal/publish", (req, res) => {
  if (req.header("x-relay-secret") !== SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { topic, envelope_kind, payload } = req.body as {
    topic?: string;
    envelope_kind?: "state" | "log" | "label" | "channel_ref";
    payload?: unknown;
  };
  if (!topic || !envelope_kind) return res.status(400).json({ error: "invalid" });
  broadcast(topic, envelope_kind, payload);
  res.json({ ok: true, subscribers: clients.size });
});

app.get("/health", (_req, res) => res.json({ ok: true, role: "relay", connections: clients.size }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws) => {
  const client: Client = { ws, subscriptions: new Set() };
  clients.add(client);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as RelayClientMessage;
      if (msg.type === "PING") {
        const pong: RelayServerMessage = { type: "PONG" };
        ws.send(JSON.stringify(pong));
        return;
      }
      if (msg.type === "HELLO") {
        client.actorId = msg.actor_id;
        for (const s of msg.subscriptions) client.subscriptions.add(s);
        const welcome: RelayServerMessage = {
          type: "WELCOME",
          session_id: randomUUID(),
          server_time: new Date().toISOString(),
        };
        ws.send(JSON.stringify(welcome));
      }
    } catch {
      /* ignore */
    }
  });

  ws.on("close", () => clients.delete(client));
});

httpServer.listen(PORT, () => {
  console.log(`Relay HTTP + WS on http://127.0.0.1:${PORT}  (ws path /ws)`);
});
