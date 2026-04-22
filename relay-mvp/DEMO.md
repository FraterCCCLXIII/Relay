# Demo script — Relay MVP

Assume `pnpm dev` is running and the DB is migrated + seeded (`pnpm db:migrate && pnpm db:seed`).

## Likes and comments (testing)

- **Like:** On Reader or a thread, use **♥** — toggles `reaction.add` / `reaction.remove` on your demo actor’s log; counts come from `GET /reactions/summary`.
- **Comment / reply:** Click **Reply** (or open Publisher with `?reply_to=post:…`) to publish a post whose `reply_to` points at the parent. Thread view lists **Comments** via `GET /objects/…/replies`.

## Scenario 1 — Create / edit / delete post

1. In the web header, choose **alice**.
2. Open **Publisher** (`/publisher`).
3. Write a post and **Publish to my feed**.
4. Switch to **bob**, open **Reader** — the new post appears on the timeline (bob follows alice in seed data; if not, click **Follow** on alice’s actor page).
5. As **alice**, **Edit** the post; reload Reader as bob — text updates (origin version bump + `state.commit`).
6. **Delete at origin** — Reader shows **tombstone** / deleted styling on the card.

**What to notice:** All writes go through **HTTP PUT** on the origin; relay may notify subscribers, but refreshing uses origin state.

## Scenario 2 — Channel ref + moderation overlay

1. Copy a post’s `object_id` from Reader or Publisher (or use the seeded post).
2. Open **Channels** → enter the demo channel.
3. Paste the id into **Submit a post ref** and **Add ref** (works as any demo actor with permission — MVP is open).
4. Switch header to **mod**.
5. Click **Apply removed_from_channel** under a post.
6. Channel view shows **“Removed from this channel.”**
7. Open **Reader** or **Actor** page for the author — the **post content still exists** at origin; only the channel overlay changed.

**What to notice:** **Channel removal ≠ global delete** — labels are **additive** and **scoped**.

## Scenario 3 — Relay outage + HTTP fallback

1. As **bob**, open **Reader**.
2. Click **Simulate relay outage** (or **Disconnect WS**).
3. As **alice**, publish or edit a post.
4. As **bob**, click a manual refresh path: navigate away and back to Reader, or trigger reload — timeline updates via **`GET /feed/home`** even with relay disconnected.
5. **Resume relay** / reconnect when you want live events again.

**What to notice:** **WebSocket is acceleration**; **HTTP** converges.

## Scenario 4 — Multi-device conflict

1. As **alice**, open **Publisher** in **two browser tabs**.
2. Pick the same post, click **Edit** in both (same starting `expected_version`).
3. Save in tab A, then save in tab B.
4. Tab B should show a **409 conflict** banner; the UI fetches the **authoritative** version from origin and explains the version skew.

**What to notice:** **Origin wins**; clients surface **conflict_detected** instead of silently overwriting.

## Scenario 5 — Indexer transparency

1. Open **Diagnostics** (`/diagnostics`).
2. Inspect JSON for **`/indexer/policy`** and **`/indexer/sources`** — explains feed inputs (no hidden ranking).
3. Open **`/indexer/explain`** payload — lists DB tables used as inputs in this MVP.

**What to notice:** Discovery is **inspectable**; policy is **machine-readable**, not a black box.
