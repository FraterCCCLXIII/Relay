import type { RelayClientMessage, RelayServerMessage } from "@relay-mvp/protocol";

export type RelayWsOptions = {
  url: string;
  actorId: string;
  subscriptions: string[];
  onEvent: (msg: Extract<RelayServerMessage, { type: "EVENT" }>) => void;
  onConnectionChange?: (connected: boolean) => void;
};

/** Minimal WebSocket client with reconnect (MVP). */
export class RelayWsClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;

  constructor(private readonly opt: RelayWsOptions) {}

  connect(): void {
    this.closedByUser = false;
    this.ws = new WebSocket(this.opt.url);
    this.ws.onopen = () => {
      const hello: RelayClientMessage = {
        type: "HELLO",
        actor_id: this.opt.actorId,
        subscriptions: this.opt.subscriptions,
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
        window.setTimeout(() => this.connect(), 2000);
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
    this.connect();
  }
}
