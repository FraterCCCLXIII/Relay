/**
 * Fast Relay — acceleration only. Origin remains source of truth.
 * Exposed for standalone `apps/relay` and the unified all-in-one server.
 */
import { createHmac, randomUUID } from "node:crypto";
import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import type { RelayClientMessage, RelayServerMessage } from "@relay-mvp/protocol";

type Client = {
  ws: import("ws").WebSocket;
  subscriptions: Set<string>;
  actorId?: string;
  lastEventSeq: number;
};

const RELAY_HELLO_BUCKET_MS = 5 * 60 * 1000;

function createBroadcast(
  clients: Set<Client>,
  nextEventSeq: () => number,
) {
  return function broadcast(
    topic: string,
    envelope_kind: "state" | "log" | "label" | "channel_ref",
    payload: unknown,
  ): void {
    const seq = nextEventSeq();
    const msg: RelayServerMessage = {
      type: "EVENT",
      source: "relay",
      topic,
      envelope_kind,
      event_seq: seq,
      payload,
    };
    const raw = JSON.stringify(msg);
    for (const c of clients) {
      if ([...c.subscriptions].some((s) => topicMatches(s, topic))) {
        if (c.ws.readyState === 1) c.ws.send(raw);
      }
    }
  };
}

function topicMatches(sub: string, topic: string): boolean {
  if (sub === topic) return true;
  if (sub === "global" || sub === "*") return true;
  return false;
}

function verifyHello(
  msg: Extract<RelayClientMessage, { type: "HELLO" }>,
  helloSecret: string,
  allowUnverified: boolean,
): boolean {
  if (allowUnverified && !msg.demo_token) return true;
  if (!msg.demo_token || msg.hello_bucket == null) return false;
  const expected = createHmac("sha256", helloSecret)
    .update(`${msg.actor_id}\n${msg.hello_bucket}`)
    .digest("hex");
  return msg.demo_token === expected && isFreshBucket(msg.hello_bucket);
}

function isFreshBucket(bucket: number): boolean {
  const now = Date.now();
  const low = now - 2 * RELAY_HELLO_BUCKET_MS;
  const high = now + 2 * RELAY_HELLO_BUCKET_MS;
  return bucket >= low && bucket <= high;
}

/**
 * @param options.wsPath — full URL path e.g. `/ws` (standalone) or `/api/relay/ws` (unified)
 * @param options.helloSecret — must match origin `RELAY_HELLO_SECRET` for HMAC on HELLO
 */
export function createRelayService(options: {
  secret: string;
  wsPath: string;
  /** Same default as origin `RELAY_HELLO_SECRET` */
  helloSecret?: string;
}): {
  app: Express;
  attachToHttpServer: (httpServer: Server) => WebSocketServer;
} {
  const clients = new Set<Client>();
  let eventSeq = 0;
  const nextEventSeq = () => {
    eventSeq += 1;
    return eventSeq;
  };
  const broadcast = createBroadcast(clients, nextEventSeq);
  const SECRET = options.secret;
  const HELLO_SECRET = options.helloSecret ?? process.env.RELAY_HELLO_SECRET ?? "relay-hello-dev";
  const allowUnverified = process.env.RELAY_ALLOW_UNVERIFIED_HELLO === "1";

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
    res.json({ ok: true, subscribers: clients.size, next_event_seq: eventSeq });
  });

  app.get("/health", (_req, res) => res.json({ ok: true, role: "relay", connections: clients.size }));

  function attachToHttpServer(httpServer: Server): WebSocketServer {
    const wss = new WebSocketServer({ server: httpServer, path: options.wsPath });

    wss.on("connection", (ws) => {
      const client: Client = { ws, subscriptions: new Set(), lastEventSeq: 0 };
      clients.add(client);

      const send = (m: RelayServerMessage) => {
        if (ws.readyState === 1) ws.send(JSON.stringify(m));
      };

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as RelayClientMessage;
          if (msg.type === "PING") {
            send({ type: "PONG" });
            return;
          }
          if (msg.type === "HELLO") {
            if (!verifyHello(msg, HELLO_SECRET, allowUnverified)) {
              send({
                type: "ERROR",
                code: "hello_rejected",
                message: "Invalid or missing HELLO proof. Fetch /auth/relay-ws on origin and set demo_token + hello_bucket.",
              });
              ws.close(4001, "hello_rejected");
              return;
            }
            client.actorId = msg.actor_id;
            client.subscriptions.clear();
            for (const s of msg.subscriptions) client.subscriptions.add(s);
            const welcome: RelayServerMessage = {
              type: "WELCOME",
              session_id: randomUUID(),
              server_time: new Date().toISOString(),
              relay_protocol: "mvp-0.1",
            };
            send(welcome);
          }
        } catch {
          /* ignore */
        }
      });

      ws.on("close", () => clients.delete(client));
    });

    return wss;
  }

  return { app, attachToHttpServer };
}

/** Standalone: dedicated HTTP server + default `/ws` path. */
export function startStandaloneRelay(): void {
  const PORT = Number(process.env.RELAY_PORT ?? 3002);
  const SECRET = process.env.RELAY_INTERNAL_SECRET ?? "relay-dev-secret";
  const { app, attachToHttpServer } = createRelayService({ secret: SECRET, wsPath: "/ws" });
  const httpServer = createServer(app);
  attachToHttpServer(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`Relay HTTP + WS on http://127.0.0.1:${PORT}  (ws path /ws)`);
  });
}
