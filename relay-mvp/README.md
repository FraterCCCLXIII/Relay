# Relay MVP monorepo

Small, end-to-end demonstration of **Relay v1.2-style** architecture: **origin-authoritative** mutable state, **append-only logs**, **additive labels**, **channels as refs + overlays**, **WebSocket relay as acceleration** with **HTTP snapshot fallback**, and **indexer transparency** endpoints.

## Layout

| Path | Role |
|------|------|
| `apps/origin` | HTTP origin: identity, state CRUD, log append/fetch, snapshots, labels, channels, demo auth |
| `apps/relay` | WebSocket fan-out + `POST /internal/publish` (origin pushes events) |
| `apps/indexer` | Read-only transparency: `GET /indexer/policy`, `/sources`, `/explain` |
| `apps/web` | Single React app with **Reader**, **Publisher**, **Channel** flows + diagnostics |
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

**Run everything**

```bash
pnpm dev
```

- Web: http://127.0.0.1:5173  
- Origin: http://127.0.0.1:3001  
- Relay: http://127.0.0.1:3002 (WebSocket `ws://127.0.0.1:3002/ws`)  
- Indexer: http://127.0.0.1:3003  

Environment (optional) — `apps/web`:

- **Dev (`pnpm dev`):** leave `VITE_ORIGIN_URL` and `VITE_INDEXER_URL` **unset** so the UI calls **`/api/origin`** and **`/api/indexer`** (Vite proxies to ports 3001 / 3003). That avoids the browser loading `index.html` when the API base is wrong (JSON parse error: `Unexpected token '<'`).
- Override only if needed: `VITE_ORIGIN_URL`, `VITE_INDEXER_URL`, `VITE_RELAY_WS`.

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

## Documentation

- **`MVP-PROTOCOL-SUBSET.md`** — exactly what was implemented vs stubbed.
- **`DEMO.md`** — step-by-step scenarios (edit/delete, channel moderation, relay outage, conflicts, transparency).

## Honest UX notes (by design)

- **Public content** can remain addressable; **author delete** is a **tombstone** at origin, not “vanished from the universe.”
- **Removed from channel** is a **label overlay**; the **actor feed** still shows the post unless the author deletes it.
- **Relay** may deliver events first; **truth** is **HTTP origin** + snapshots.
