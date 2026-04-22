import type { RelayClientMessage, RelayServerMessage } from "@relay-mvp/protocol";

export type RelayWsOptions = {
  url: string;
  actorId: string;
  subscriptions: string[];
  onEvent: (msg: Extract<RelayServerMessage, { type: "EVENT" }>) => void;
  onConnectionChange?: (connected: boolean) => void;
  /**
   * Base origin API URL, e.g. `http://127.0.0.1:3001` or `/api/origin` (Vite proxy).
   * When set, fetches `GET {originBaseUrl}/auth/relay-ws?actor_slug=...` before HELLO to obtain a signed `demo_token`.
   */
  originBaseUrl?: string;
  /** Slug for `actor_slug` query (demo mode) when not using session cookies. */
  actorSlugForRelayAuth?: string;
  withCredentials?: boolean;
};

/** Minimal WebSocket client with reconnect (MVP). */
export class RelayWsClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;

  constructor(private readonly opt: RelayWsOptions) {}

  connect(): void {
    void this.connectAsync();
  }

  private async connectAsync(): Promise<void> {
    this.closedByUser = false;
    let demoToken: string | undefined;
    let helloBucket: number | undefined;
    if (this.opt.originBaseUrl) {
      const base = this.opt.originBaseUrl.replace(/\/$/, "");
      const slug = (this.opt.actorSlugForRelayAuth ?? "bob").trim().toLowerCase();
      const u = `${base}/auth/relay-ws?actor_slug=${encodeURIComponent(slug)}`;
      const r = await fetch(u, { credentials: this.opt.withCredentials ? "include" : "same-origin" });
      if (r.ok) {
        const j = (await r.json()) as { demo_token?: string; hello_bucket?: number; actor_id?: string };
        demoToken = j.demo_token;
        helloBucket = j.hello_bucket;
      }
    }
    this.ws = new WebSocket(this.opt.url);
    this.ws.onopen = () => {
      const hello: RelayClientMessage = {
        type: "HELLO",
        actor_id: this.opt.actorId,
        subscriptions: this.opt.subscriptions,
        ...(demoToken && helloBucket != null ? { demo_token: demoToken, hello_bucket: helloBucket } : {}),
      };
      this.ws?.send(JSON.stringify(hello));
      this.opt.onConnectionChange?.(true);
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as RelayServerMessage;
        if (msg.type === "EVENT") this.opt.onEvent(msg);
      } catch {
        /* ignore */
      }
    };
    this.ws.onclose = () => {
      this.opt.onConnectionChange?.(false);
      if (!this.closedByUser) {
        globalThis.setTimeout(() => void this.connectAsync(), 2000);
      }
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
    this.opt.onConnectionChange?.(false);
  }

  reconnect(): void {
    this.disconnect();
    this.closedByUser = false;
    void this.connectAsync();
  }
}
