import "./db.js";

const SECRET = process.env.RELAY_INTERNAL_SECRET ?? "relay-dev-secret";

function relayBaseUrl(): string {
  return process.env.RELAY_INTERNAL_URL ?? "http://127.0.0.1:3002";
}

export async function publishToRelay(msg: {
  topic: string;
  envelope_kind: "state" | "log" | "label" | "channel_ref";
  payload: unknown;
}): Promise<void> {
  const base = relayBaseUrl().replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/internal/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Secret": SECRET,
      },
      body: JSON.stringify(msg),
    });
    if (!r.ok) {
      console.warn("[origin] relay publish failed:", r.status, await r.text());
    }
  } catch (e) {
    console.warn("[origin] relay unreachable (clients can HTTP fallback):", (e as Error).message);
  }
}
