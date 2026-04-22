# Relay MVP monorepo

Small, end-to-end demonstration of **Relay v1.2-style** architecture: **origin-authoritative** mutable state, **append-only logs**, **additive labels**, **channels as refs + overlays**, **WebSocket relay as acceleration** with **HTTP snapshot fallback**, and **indexer transparency** endpoints.

## Layout

| Path | Role |
|------|------|
| `apps/origin` | HTTP origin: identity, state CRUD, log append/fetch, snapshots, labels, channels, demo auth |
| `apps/relay` | WebSocket fan-out + `POST /internal/publish` (origin pushes events) |
| `apps/indexer` | Read-only transparency: `GET /indexer/policy`, `/sources`, `/explain` |
| `apps/web` | Single React app with **Reader**, **Publisher**, **Channel** flows + diagnostics |
| `apps/unified` | **All-in-one dev server** — Vite + origin + relay + indexer on one port (no separate `dev:origin` / `dev:relay` / `dev:indexer` / `dev:web`) |
| `packages/protocol` | Shared TypeScript types + canonical JSON + stub signatures + id helpers |
| `packages/sdk` | Browser/client HTTP + relay WS helpers |
| `packages/ui` | Minimal `PostCard`, `Badge` |

The three “products” are **routes** in `apps/web` (`/reader`, `/publisher`, `/channel/:id`) sharing one backend.

## Prerequisites

- Node 20+
- [pnpm](https://pnpm.io) 9+
- PostgreSQL 16 (local or Docker)

## Quick start

```bash
cd relay-mvp
pnpm install
```

**Database** — start Postgres (example with Docker):

```bash
docker compose up -d
```

Default connection: `postgres://relay:relay@localhost:5432/relay_mvp`  
Override with `DATABASE_URL` if needed.

**Migrate & seed**

```bash
pnpm db:migrate
pnpm db:seed
```

Seed creates demo actors **`alice`**, **`bob`**, **`mod`** (select via `X-Demo-Actor` in the UI header), a channel, one post, and a follow edge (`bob` → `alice`).

**Run everything (four Node processes + Vite)**

```bash
pnpm dev
```

- Web: http://127.0.0.1:5173  
- Origin: http://127.0.0.1:3001  
- Relay: http://127.0.0.1:3002 (WebSocket `ws://127.0.0.1:3002/ws`)  
- Indexer: http://127.0.0.1:3003  

**Or one process (UI + all APIs on the same port)**

With Postgres migrate + seed as above:

```bash
pnpm dev:unified
```

- Single URL: **http://127.0.0.1:5173** — React app, `/api/origin`, `/api/indexer`, and relay at `/api/relay` (WebSocket `ws://127.0.0.1:5173/api/relay/ws`). Set `UNIFIED_PORT` to use another port if 5173 is busy.
- **Vite HMR (hot reload)** is **off by default** in unified to avoid failed HMR WebSocket attempts when the relay shares the process. Set **`UNIFIED_HMR=1`** to enable; HMR then uses a **separate** WebSocket port (default **`UNIFIED_PORT + 20000`**, e.g. 25188 for `UNIFIED_PORT=5188`). Override the port with `UNIFIED_HMR_PORT=…`. Console noise from **`content.js` / `polyfill.js` “Receiving end”** is almost always a **browser extension**, not the app.

Environment (optional) — `apps/web`:

- **Dev (`pnpm dev`):** leave `VITE_ORIGIN_URL` and `VITE_INDEXER_URL` **unset** so the UI calls **`/api/origin`** and **`/api/indexer`** (Vite proxies to ports 3001 / 3003). That avoids the browser loading `index.html` when the API base is wrong (JSON parse error: `Unexpected token '<'`).
- Override only if needed: `VITE_ORIGIN_URL`, `VITE_INDEXER_URL`, `VITE_RELAY_WS`.
- **User sign-in:** set `VITE_USE_SESSION=1` (unified dev sets this) so the UI uses cookie sessions. **Email + password:** `POST /api/origin/auth/register` and `/auth/login-password` (see web **Sign in** / **Register**). **Google:** set `RELAY_MVP_OAUTH_GOOGLE_ID`, `RELAY_MVP_OAUTH_GOOGLE_SECRET`, and `RELAY_MVP_OAUTH_GOOGLE_CALLBACK_URL` to the exact callback URL (e.g. `http://127.0.0.1:5188/api/origin/auth/oauth/google/callback` in unified). Run **`pnpm db:migrate`** after pulling so `local_accounts` / `oauth_accounts` exist.

Relay internal auth (origin → relay): set `RELAY_INTERNAL_SECRET` the same on both origin and relay (default `relay-dev-secret`).

### Troubleshooting: **http://127.0.0.1:5173** will not load

- **Nothing listening:** from `relay-mvp/`, with Postgres migrated + seeded, run **`pnpm dev`**. The UI is Vite; it is bound to **127.0.0.1:5173** (see `apps/web/vite.config.ts`). If the command fails with **port 5173 already in use**, another process (often an old Vite) is holding the port. Free it, then start again:  
  `lsof -i :5173`  
  then stop that PID, or:  
  `kill $(lsof -t -i :5173)`  
  (only if you intend to stop that process.)
- **Port already used and Vite used to “hop” to 5174+:** we now set **`strictPort: true`**, so `pnpm dev` will **fail clearly** if 5173 is busy instead of serving on another port with no warning.
- If you use **`pnpm dev:web` alone**, you still need the **origin** on **3001** (or you will see 502s from the proxy). Prefer **`pnpm dev`** for the full stack.

### Troubleshooting: `Unexpected token '<'` in the console

The app expected JSON but received HTML (usually Vite’s `index.html`). **Fix:** remove a bad `apps/web/.env` that points `VITE_ORIGIN_URL` at the Vite port (`5173`) or leaves it empty in a way that breaks resolution; restart `pnpm dev`; ensure **origin** is running on **3001**.

### Troubleshooting: `500` or `502` on `/api/origin/...`

- **502** with JSON `proxy_upstream_unreachable`: nothing is listening on **3001**. Run **`pnpm dev`** (all services) or **`pnpm dev:origin`** with a valid **`DATABASE_URL`**, then refresh the web app.
- **500** with JSON `internal_error`: the origin is up but threw (often **Postgres**). Run **`pnpm db:migrate`** (and **`pnpm db:seed`** if the DB is empty). Check the origin terminal for the stack trace.

## Default test run (`pnpm test`)

From `relay-mvp/`, the **`pnpm test`** entrypoint runs:

1. **`pnpm typecheck`** — all workspace packages
2. **`pnpm registry:validate`** — JSON Schema in `../registry/`
3. **`pnpm test:httpsig-vectors`** — §19-style canonical string regression
4. **Builds** `@relay-mvp/cli` and, if **origin** answers at `http://127.0.0.1:3001/health`, runs **`relay-mvp test`**, **`relay-mvp private-channels`**, and **`relay-mvp two-nodes`** when a second origin is up on `http://127.0.0.1:3004`

If no origin is running, steps 1–3 and the CLI build still run; integration tests are **skipped** (use **`pnpm test:local`** to bring up DB + servers automatically).

- **`pnpm test:static`** — only typecheck + registry + httpsig (no CLI build, no network).
- **`SKIP_CLI_INTEGRATION=1 pnpm test`** — static + CLI build, skip on-wire CLI tests.
- After schema changes: **`pnpm db:migrate`** and usually **`pnpm db:seed`** so `private-channels` matches seeded expectations.

## CLI — smoke tests

With **origin** (and **Postgres** + migrate + seed) already running, from `relay-mvp/`:

```bash
pnpm test:smoke
```

This builds `packages/cli` and runs `relay-mvp` against **`http://127.0.0.1:3001`** (override with `RELAY_MVP_ORIGIN` or `--origin <url>`). Optional: `--indexer http://127.0.0.1:3003` or `RELAY_MVP_INDEXER` to check indexer endpoints. `RELAY_MVP_WRITER` / `RELAY_MVP_READER` (or `--writer` / `--reader`) default to **alice** / **bob** to match the seed.

### Full local run (build + DB + API servers + smoke)

From `relay-mvp/`, in one go:

```bash
pnpm test:local
```

This:

1. Runs **`pnpm run build`**
2. Starts **`docker compose up -d`** for Postgres (skip with **`SKIP_DOCKER=1`** if the DB is already up)
3. Retries **`pnpm db:migrate`** until the DB is reachable, then **`pnpm db:seed`**
4. Starts **origin** (`:3001`) and **indexer** (`:3003`) from `apps/*/dist` (use **`TEST_LOCAL_VERBOSE=1`** to show server output instead of a quiet pipe)
5. Runs the **CLI** smoke test against that stack, then **stops** the two node processes (Docker is left running)

`DATABASE_URL` defaults to the same DSN as in **Quick start**; override if needed. The script also loads **`relay-mvp/.env`** when present (so it matches `pnpm dev`).

**Ports 3001 and 3003 must be free** before `test:local` runs (it starts its own origin + indexer). If you already have **`pnpm dev`** running, use only build + CLI against the live stack:

```bash
RELAY_MVP_TEST_REUSE=1 pnpm test:local
```

## Two independent origins (optional)

Use this to prove **two** Postgres databases and **two** HTTP origins with **public** reads on “node A” while a client on “node B” only talks to B for local feed/identity. Cross-origin follow is not in the MVP; this is **read interop** and separate `actor_id` namespaces.

**Automated (build + 2nd DB + 2 processes + CLI):** from `relay-mvp/`, ports **3001** and **3004** must be free.

```bash
pnpm test:two-nodes
```

- Creates a second database **`relay_mvp_b`** (if missing) on the same Postgres (Docker: `CREATE DATABASE` via `docker compose exec`, or with `SKIP_DOCKER=1` try **local `psql`** against the `postgres` admin database).
- Migrates and seeds both **`relay_mvp`** (A) and **`relay_mvp_b`** (B) with the usual demo data.
- Starts origin on **:3001** and **:3004**, then runs the CLI: **`node packages/cli/dist/index.js two-nodes`** (also exposed as the same script after `pnpm test:two-nodes` builds the monorepo).

**If both origins are already running:** only build and run the interop check:

```bash
RELAY_MVP_TWO_NODE_REUSE=1 pnpm test:two-nodes
```

**CLI only** (any time two origins are up):

```bash
pnpm --filter @relay-mvp/cli run build
node packages/cli/dist/index.js two-nodes --a http://127.0.0.1:3001 --b http://127.0.0.1:3004
```

`RELAY_MVP_NODE_A`, `RELAY_MVP_NODE_B`, and `RELAY_MVP_READER` (default **bob**) match the CLI flags. The automated script uses **`RELAY_MVP_DATABASE_URL_B`** for node B if set; otherwise it reuses the same host, port, and user as **`DATABASE_URL`** and only changes the path to the **`relay_mvp_b`** database (so it stays on the same Postgres as node A).

**Two dev UIs (optional):** one stack proxied to **3001** (default Vite **5173**), a second to **3004** on **5174**:

```bash
# Terminal 1: node B’s origin
DATABASE_URL=postgres://relay:relay@localhost:5432/relay_mvp_b ORIGIN_PORT=3004 pnpm dev:origin
# Terminal 2: B’s Vite
pnpm dev:web:peer
```

Open **/remote** in the B UI, set the “remote” base to **http://127.0.0.1:3001**, and `GET /health` or `GET /actors` (browser fetches; `cors()` on the origin must allow the dev origin).

## Private channels (optional)

MVP: **server-side** membership and **AES-256-GCM** storage for a small `welcome` string (`channel_secrets` table). The key is derived from the channel id and `RELAY_MVP_CHANNEL_PEPPER` (default dev pepper). This is for **gating + encrypted-at-rest checks**, not end-to-end group crypto between user devices.

**Run tests** (migrated + seeded origin on **:3001**; for ciphertext byte checks, export the same `DATABASE_URL` the origin uses, and have `psql` on `PATH`):

```bash
pnpm test:private-channels
# optional: two databases — second origin on :3004 after two-node or manual start
RELAY_MVP_NODE_B=http://127.0.0.1:3004 pnpm test:private-channels
# or: node packages/cli/dist/index.js private-channels --b http://127.0.0.1:3004
```

The suite checks: private channels are absent from the public list; **403** for non-members; **encrypted** storage does not embed the seed plaintext as raw UTF-8 bytes in `channel_secrets.ciphertext` (optional `psql` step); add/remove members and **invite+join**; if `--b` is set, the second origin’s channel list is disjoint from the first. **Federation note:** `X-Demo-Actor: bob` is resolved in **each** origin’s database, so the same *slug* is a different `actor_id` on A vs B; private membership is **per origin**.

## CI and Docker staging

- **GitHub Actions** (at the **repo root** `Relay/`, if this is your Git): [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `pnpm install`, `typecheck`, and `build` in `relay-mvp/`.
- **One-container staging** (Postgres + all APIs + static web on port 4173):

  ```bash
  cd relay-mvp
  pnpm run compose:staging
  ```

  Then open **http://127.0.0.1:4173/** (Vite preview). APIs: **:3001** origin, **:3002** relay, **:3003** indexer.  
  `RELAY_MVP_STAGING_SEED=0` avoids re-seeding on container restart (set in `docker-compose.staging.yml` or shell).

- **What we have not built** (auth, federation, E2E, admin, mobile, load): see [`ROADMAP.md`](./ROADMAP.md).

## Documentation

- **`MVP-PROTOCOL-SUBSET.md`** — exactly what was implemented vs stubbed.
- **`DEMO.md`** — step-by-step scenarios (edit/delete, channel moderation, relay outage, conflicts, transparency).

## Honest UX notes (by design)

- **Public content** can remain addressable; **author delete** is a **tombstone** at origin, not “vanished from the universe.”
- **Removed from channel** is a **label overlay**; the **actor feed** still shows the post unless the author deletes it.
- **Relay** may deliver events first; **truth** is **HTTP origin** + snapshots.
