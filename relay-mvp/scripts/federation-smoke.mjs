#!/usr/bin/env node
/**
 * Smoke test: two origins, allow-list B on A, resolve remote actor, append federation log.
 * Requires: origin A and B (e.g. test:two-nodes) and RELAY_ADMIN_TOKEN for POST /federation/peers.
 *
 *   ORIGIN_A=http://127.0.0.1:3001 ORIGIN_B=http://127.0.0.1:3004 \
 *   RELAY_ADMIN_TOKEN=secret RELAY_DEMO_ACTOR_HEADER=1 \
 *   node scripts/federation-smoke.mjs
 *
 * RELAY_DEMO_ACTOR_HEADER: use X-Demo-Actor: alice for remote-subscribe (default demo local).
 */
import process from "node:process";

const A = process.env.ORIGIN_A ?? "http://127.0.0.1:3001";
const B = process.env.ORIGIN_B ?? "http://127.0.0.1:3004";
const admin = process.env.RELAY_ADMIN_TOKEN;
const demoSlug = process.env.DEMO_SLUG ?? "alice";
const headerDemo = process.env.RELAY_DEMO_ACTOR_HEADER !== "0";

async function main() {
  if (!admin) {
    console.log("SKIP: set RELAY_ADMIN_TOKEN to test POST /federation/peers (admin on origin A).");
    process.exit(0);
  }
  const peerRes = await fetch(`${A}/federation/peers`, {
    method: "POST",
    headers: { "x-admin-token": admin, "Content-Type": "application/json" },
    body: JSON.stringify({ origin_url: B.replace(/\/$/, ""), label: "origin_b" }),
  });
  if (!peerRes.ok) {
    const t = await peerRes.text();
    throw new Error(`POST /federation/peers: ${peerRes.status} ${t}`);
  }
  const resolveRes = await fetch(
    `${A}/federation/resolve?origin_url=${encodeURIComponent(B.replace(/\/$/, ""))}&slug=${encodeURIComponent(demoSlug)}`,
  );
  if (!resolveRes.ok) {
    const t = await resolveRes.text();
    throw new Error(`GET /federation/resolve: ${resolveRes.status} ${t}`);
  }
  const remote = await resolveRes.json();
  console.log("resolve:", remote);
  if (!remote.actor_id) throw new Error("expected actor_id in resolve response");
  const listA = await (await fetch(`${A}/actors`)).json();
  const me = listA.find((x) => x.slug === demoSlug);
  if (!me) throw new Error("No actor " + demoSlug + " on A");
  const h = { "Content-Type": "application/json" };
  if (headerDemo) h["X-Demo-Actor"] = demoSlug;
  const sub = await fetch(`${A}/actors/${encodeURIComponent(me.actor_id)}/federation/remote-subscribe`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ origin_url: B.replace(/\/$/, ""), followee_slug: demoSlug }),
  });
  if (!sub.ok) {
    const t = await sub.text();
    throw new Error(`remote-subscribe: ${sub.status} ${t}`);
  }
  const log = await sub.json();
  console.log("log event:", log.type, log.data);
  console.log("federation-smoke: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
