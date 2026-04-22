import { useCallback, useEffect, useRef, useState } from "react";
import { RelayWsClient } from "@relay-mvp/sdk";
import type { RelayServerMessage } from "@relay-mvp/protocol";
import { RELAY_WS } from "./config.js";

export function useRelay(actorId: string | null, enabled: boolean) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<Extract<RelayServerMessage, { type: "EVENT" }> | null>(null);
  const clientRef = useRef<RelayWsClient | null>(null);

  const refreshRef = useRef<() => void>(() => {});
  const setRefresh = useCallback((fn: () => void) => {
    refreshRef.current = fn;
  }, []);

  useEffect(() => {
    if (!enabled || !actorId) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      setConnected(false);
      return;
    }
    const c = new RelayWsClient({
      url: RELAY_WS,
      actorId,
      subscriptions: ["global"],
      onEvent: (msg) => {
        setLastEvent(msg);
        refreshRef.current();
      },
      onConnectionChange: setConnected,
    });
    clientRef.current = c;
    c.connect();
    return () => c.disconnect();
  }, [actorId, enabled]);

  const disconnectRelay = useCallback(() => {
    clientRef.current?.disconnect();
    setConnected(false);
  }, []);

  const reconnectRelay = useCallback(() => {
    clientRef.current?.reconnect();
  }, []);

  return { connected, lastEvent, setRefresh, disconnectRelay, reconnectRelay };
}
