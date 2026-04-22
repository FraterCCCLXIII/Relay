# Relay v1.2 — MVP subset implemented

This document records what the `relay-mvp` codebase implements so you can compare it to `Relay-Stack-Spec-v1-2.md` without guessing.

## Implemented (wire shapes & behavior)

### Profiles / roles (documentation only)

- Identity documents include `relay_profiles: ["relay.profile.social"]` on seeded actors.
- Deployment is **not** a full v1.2 conformance claim; it is a **reference-shaped** MVP.

### Identity

- `GET /actors/:actorId/identity` returns a JSON identity document (`kind: identity`, `actor_id`, `keys.active`, `relay_profiles`, optional `display_name` / `bio`).
- **`actor_id`** is computed as `relay:actor:` + multihash-style SHA-256 over the **32-byte Ed25519 public key** (see `packages/protocol/src/ids.ts`), matching the spec’s intent for new IDs.

### State objects

- `GET /actors/:actorId/state/:objectId`
- `PUT /actors/:actorId/state/:objectId` with optimistic concurrency via `expected_version` (integer).
- `GET /objects/:objectId` resolves a post (or any state) to its owning `actor_id` in this **single-tenant** deployment.
- **Conflict handling (§5-style):** mismatched `expected_version` → **409** JSON `{ error: "conflict_detected", authoritative_version, … }`.
- **Delete:** `PUT` with `deleted: true` sets tombstone semantics at origin (payload cleared in MVP UI; row retained).

Schemas used in demos: `post`, `profile`.

### Log events

- `GET /actors/:actorId/log?since_seq=` returns append-ordered events with monotonic `seq` cursor.
- `POST /actors/:actorId/log` appends with **`prev` = current head** enforcement (409 on mismatch).
- **Appendix B `data` shapes** for:
  - `follow.add` / `follow.remove` → `{}`, with `target` = followee `actor_id`
  - `state.commit` / `state.delete` → `{ object_id, version }`
  - `key.rotate` — **not exercised in UI**; would use `{ new_key_id, previous_key_id? }` if added
- **Optional extensions in types**:
  - `reaction.add` / `reaction.remove` — **implemented for “like” testing**. `data`: `{ "object_id": "<target post id>", "reaction_kind": "like" }`; envelope `target` is the post id. A **`reactions`** table on the origin mirrors state for fast `GET /reactions/summary` (not normative for full Relay interop).
  - `channel.accept` — emitted when a **new** channel ref is inserted.
  - `channel.remove` — **not used**; moderation demo uses **`removed_from_channel` label** instead (smaller scope, same UX lesson).

### Labels (moderation overlays)

- `GET /labels?target=&channel_id=`
- `POST /labels` (issuer = authenticated demo actor)
- Enum includes **`removed_from_channel`** per spec label set.
- Labels **do not** mutate author state objects.

### Channels

- `GET /channels` — lists **public** channels for everyone; **private** channels only if `X-Demo-Actor` resolves to the **owner** or a **member** on this origin.
- `GET /channels/:channelId` — **403** for private channels when the actor is not a member (or anonymous).
- `POST /channels` — create a channel. Body: `{ title, description?, visibility?: "public"|"private", welcome_plaintext? }`. If `welcome_plaintext` is set, it is stored in `channel_secrets` as **AES-256-GCM** ciphertext (server key derived from `RELAY_MVP_CHANNEL_PEPPER` + `channel_id`; **not** end-to-end between clients).
- `POST /channels/:channelId/members` — **owner** adds a member: `{ member_actor_id }` or `{ member_slug }`.
- `DELETE /channels/:channelId/members/:actorId` — **owner** removes a member.
- `POST /channels/:channelId/invites` — **owner** issues `{ token }` (returned once); `POST /…/join` with `{ token }` adds the current demo actor as a member.
- `POST /channels/:channelId/refs` — **private** channels require the actor to be a member before adding refs.
- Channel view in the web app merges **refs + labels** to show “removed from this channel.”

### Snapshots

- `GET /actors/:actorId/snapshots/latest` returns self-consistent **current** state slice for that actor plus `log_head_event_id` (MVP: “latest” = current rows, not a frozen historical cut).

### WebSocket relay (acceleration only)

- `apps/relay` exposes `GET /health` and `WebSocket /ws`.
- Client sends `HELLO` with `subscriptions`; MVP server treats **`global`** as “fan out all published topics to this client” (demo convenience).
- Origin calls `POST /internal/publish` with `X-Relay-Secret` after commits (fire-and-forget).
- **Not implemented:** Ed25519 `HELLO` auth per §18.1.1, PUB signature verification, replay window enforcement.

### Indexer transparency (§17.9-style)

- `GET /indexer/policy`, `/indexer/sources?actor_id=`, `/indexer/explain` on `apps/indexer`.

### Authentication / signing (stubbed)

- **HTTP:** demo actors are selected with header **`X-Demo-Actor: alice|bob|mod`**. This is **not** RFC 9421 HTTP message signatures (§19).
- **Object signatures:** `stub:…` HMAC-like digest via `stubSignature()`; structured so **real Ed25519** can replace signing/verification at the protocol boundary.
- **Canonical JSON:** key-sorted stringify implemented (`canonicalStringify`); full §4.1.1 numeric / NFC rules are **not** enforced in code.

## Explicit non-goals (out of scope)

- True **end-to-end** group encryption, paid membership, portable membership proofs to other products, P2P sync, ranking/ML, production hardening, OAuth. (**Note:** the MVP may include **server-side** private channel encryption for small secrets such as a welcome string to exercise **ciphertext in DB** + **membership gating** in tests; see `relay-mvp private-channels` CLI.)

## Files to read first

- `packages/protocol/src/types.ts` — wire types for MVP
- `apps/origin/src/createApp.ts` — REST surface + semantics
- `apps/relay/src/index.ts` — relay fan-out
- `apps/indexer/src/index.ts` — transparency JSON
