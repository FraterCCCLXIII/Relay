import { spawnSync } from "node:child_process";

function containsPlaintextUtf8InHex(ciphertextHex: string, plaintext: string): boolean {
  const needle = Buffer.from(plaintext, "utf8").toString("hex").toLowerCase();
  return ciphertextHex.toLowerCase().includes(needle);
}

const PRIVATE_TITLE_SNIPPET = "Private lounge";
const SEED_PLAINTEXT = "SEED-PRIVATE-CHANNEL-MESSAGE-MVP-TEST";

export type PrivateChannelTestOptions = {
  originBaseUrl: string;
  /** If set, verify another origin has a disjoint channel set (federated / two-node). */
  secondOriginBaseUrl?: string;
};

function normBase(u: string): string {
  return u.replace(/\/$/, "");
}

function headers(slug: string): Record<string, string> {
  return { "X-Demo-Actor": slug, "Content-Type": "application/json" };
}

async function j<T>(r: Response, label: string): Promise<T> {
  const t = await r.text();
  if (t.trimStart().startsWith("<!")) {
    throw new Error(`${label}: got HTML (status ${r.status})`);
  }
  if (!r.ok) {
    throw new Error(`${label}: HTTP ${r.status} ${t.slice(0, 500)}`);
  }
  return JSON.parse(t) as T;
}

/**
 * Proves: private channel list gating, encrypted welcome (at-rest check when DATABASE_URL is set),
 * member add / remove, and optional second origin without A’s private channel.
 */
export async function runPrivateChannelTests(o: PrivateChannelTestOptions): Promise<void> {
  const base = normBase(o.originBaseUrl);
  const bob = "bob";
  const alice = "alice";
  const mod = "mod";

  console.log("  1) List channels without X-Demo-Actor: only public");
  {
    const r = await fetch(`${base}/channels`);
    const list = await j<Array<{ title: string; visibility?: string }>>(r, "/channels public");
    if (list.some((c) => c.title.includes(PRIVATE_TITLE_SNIPPET))) {
      throw new Error("private channel should not list for anonymous");
    }
  }

  console.log("  2) List as bob: no private (bob not a member in seed)");
  {
    const r = await fetch(`${base}/channels`, { headers: headers(bob) });
    const list = await j<Array<{ title: string; visibility?: string }>>(r, "/channels bob");
    if (list.some((c) => c.title.includes(PRIVATE_TITLE_SNIPPET))) {
      throw new Error("private channel should not list for non-member bob");
    }
  }

  console.log("  3) List as mod: includes private (seeded member)");
  {
    const r = await fetch(`${base}/channels`, { headers: headers(mod) });
    const list = await j<Array<{ channel_id: string; title: string }>>(r, "/channels mod");
    const priv = list.find((c) => c.title.includes(PRIVATE_TITLE_SNIPPET));
    if (!priv) throw new Error("mod should see the seeded private channel");
  }

  let privateChannelId = "";
  console.log("  4) Resolve private channel_id as mod");
  {
    const r = await fetch(`${base}/channels`, { headers: headers(mod) });
    const list = await j<Array<{ channel_id: string; title: string }>>(r, "/channels mod2");
    const row = list.find((c) => c.title.includes(PRIVATE_TITLE_SNIPPET));
    if (!row) throw new Error("private channel not found");
    privateChannelId = row.channel_id;
  }

  console.log("  5) GET channel as bob before add → 403");
  {
    const r = await fetch(`${base}/channels/${encodeURIComponent(privateChannelId)}`, { headers: headers(bob) });
    if (r.status !== 403) {
      const t = await r.text();
      throw new Error(`expected 403 for bob, got ${r.status} ${t.slice(0, 200)}`);
    }
  }

  if (process.env.DATABASE_URL) {
    console.log("  5b) DB ciphertext (hex) must not embed UTF-8 seed as raw bytes");
    const esc = privateChannelId.replace(/'/g, "''");
    const q = `SELECT encode(ciphertext, 'hex') FROM channel_secrets WHERE channel_id = '${esc}';`;
    const p = spawnSync("psql", [process.env.DATABASE_URL, "-t", "-A", "-c", q], { encoding: "utf8" });
    if (p.status !== 0) {
      console.warn("    (skip DB check: psql failed — install psql and set DATABASE_URL)");
    } else {
      const out = (p.stdout || "").trim();
      if (containsPlaintextUtf8InHex(out, SEED_PLAINTEXT)) {
        throw new Error("ciphertext still contains raw plaintext bytes (encryption broken)");
      }
    }
  } else {
    console.log("  5b) Skip DB byte check (no DATABASE_URL)");
  }

  console.log("  6) Owner (alice) adds bob as member");
  {
    const r = await fetch(`${base}/channels/${encodeURIComponent(privateChannelId)}/members`, {
      method: "POST",
      headers: headers(alice),
      body: JSON.stringify({ member_slug: bob }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`add member: ${r.status} ${t}`);
    }
  }

  console.log("  7) GET channel as bob → 200, decrypted welcome");
  {
    const r = await fetch(`${base}/channels/${encodeURIComponent(privateChannelId)}`, { headers: headers(bob) });
    const body = await j<{
      private_welcome_plaintext?: string;
      channel: { visibility?: string };
    }>(r, "GET private as bob");
    if (body.channel.visibility !== "private") throw new Error("expected private");
    if (body.private_welcome_plaintext !== SEED_PLAINTEXT) {
      throw new Error("decrypted welcome mismatch");
    }
  }

  console.log("  8) Invite flow: create token as alice, join as new member — use new channel");
  let inviteChannelId = "";
  {
    const cr = await fetch(`${base}/channels`, {
      method: "POST",
      headers: headers(alice),
      body: JSON.stringify({
        title: "Private invite test",
        visibility: "private",
        description: "CLI-created",
        welcome_plaintext: "invite-welcome",
      }),
    });
    const created = await j<{ channel: { channel_id: string } }>(cr, "POST /channels");
    inviteChannelId = created.channel.channel_id;
    const ir = await fetch(`${base}/channels/${encodeURIComponent(inviteChannelId)}/invites`, {
      method: "POST",
      headers: headers(alice),
      body: JSON.stringify({ max_uses: 2 }),
    });
    const inv = await j<{ token: string }>(ir, "POST invites");
    const jr = await fetch(`${base}/channels/${encodeURIComponent(inviteChannelId)}/join`, {
      method: "POST",
      headers: headers(mod),
      body: JSON.stringify({ token: inv.token }),
    });
    if (!jr.ok) {
      const t = await jr.text();
      throw new Error(`join: ${jr.status} ${t}`);
    }
  }

  console.log("  9) Remove bob; bob can no longer read seed private channel");
  {
    const actors = await j<Array<{ actor_id: string; slug: string }>>(
      await fetch(`${base}/actors`),
      "actors all",
    );
    const bobRow = actors.find((x) => x.slug === bob);
    if (!bobRow) throw new Error("bob not in actors");
    const del = await fetch(
      `${base}/channels/${encodeURIComponent(privateChannelId)}/members/${encodeURIComponent(bobRow.actor_id)}`,
      { method: "DELETE", headers: headers(alice) },
    );
    if (!del.ok) {
      const t = await del.text();
      throw new Error(`DELETE member: ${del.status} ${t}`);
    }
    const r = await fetch(`${base}/channels/${encodeURIComponent(privateChannelId)}`, { headers: headers(bob) });
    if (r.status !== 403) {
      const t = await r.text();
      throw new Error(`expected 403 after remove, got ${r.status} ${t.slice(0, 200)}`);
    }
  }

  if (o.secondOriginBaseUrl) {
    const b2 = normBase(o.secondOriginBaseUrl);
    console.log("  10) Second origin: same slug “bob” has no access to A’s private channel (wrong actor_id in practice)");
    {
      const r = await fetch(`${b2}/channels`, { headers: headers(bob) });
      const list = await j<Array<{ channel_id: string }>>(r, "/channels B");
      if (list.some((c) => c.channel_id === privateChannelId)) {
        throw new Error("B should not expose A’s channel_id");
      }
    }
    console.log("  11) Fetch A’s private as bob@B’s slug against A: still 403 (bob not a member on A after removal)");
    {
      const r = await fetch(`${base}/channels/${encodeURIComponent(privateChannelId)}`, { headers: headers(bob) });
      if (r.status !== 403) {
        const t = await r.text();
        throw new Error(`expected 403 cross check, got ${r.status} ${t.slice(0, 200)}`);
      }
    }
  }

  console.log(`\nPrivate channel tests passed. origin=${base}`);
}
