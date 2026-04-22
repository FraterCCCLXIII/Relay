# Relay MVP — what’s in the repo vs what’s not

This is a **reference implementation**, not a full product. The following is intentionally **out of scope** for `relay-mvp` today. Items are ordered by typical dependency (auth before federation, etc.).

| Area | Status | Notes |
|------|--------|--------|
| **CI: build + typecheck** | Done | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) at repo root (`Relay/`) — runs in `relay-mvp/`. |
| **Staging: Docker + compose** | Done | `docker-compose.staging.yml` + `Dockerfile.staging` + `scripts/staging-entrypoint.sh`. |
| **Real sign-in (OAuth, passkeys, etc.)** | Partial / MVP | **Email + password** (`POST /auth/register`, `POST /auth/login-password`, scrypt), **Google OIDC** (`GET /auth/oauth/google`, callback; env: `RELAY_MVP_OAUTH_GOOGLE_*`, `RELAY_MVP_OAUTH_GOOGLE_CALLBACK_URL`), tables `local_accounts` / `oauth_accounts`. **Passkeys / email verification / password reset** not included. Slug-based `POST /auth/login` still for dev. New actors from register/OAuth get **server-minted** Ed25519 pub key in DB (private not stored; httpsig for those actors is not end-user-held). |
| **HTTP message signatures (e.g. §19)** | Partial / MVP | Optional `RELAY_MVP_HTTPSIG_REQUIRED=1`; `X-Ed25519-*` on mutating calls; `buildRelayHttpsigString` in protocol; SDK can sign. |
| **WebSocket `HELLO` auth / replay / PUB** | Partial / MVP | **HELLO** HMAC via `GET /auth/relay-ws` + `RELAY_HELLO_SECRET`; `EVENT.event_seq` monotonic. **PUB** as client message still not used (internal publish is secret-based). |
| **Cross-origin federation (real follow/join/membership)** | Partial / MVP | `federation_peers` allow-list; `GET /federation/resolve`; `POST .../federation/remote-subscribe` appends `membership.add` with remote id; **not** full ActivityPub stack. |
| **End-to-end group encryption** | Partial / MVP | `channel_e2e_wrapped_keys` + `PUT/GET` e2e-wrapped-key; **SDK** `e2eChannel.ts` (P-256 wrap). Server pepper crypto unchanged. |
| **Global directory / discovery service** | Partial / MVP | `GET /.well-known/relay` JSON; not a separate index service. |
| **Admin / SRE app** | Partial / MVP | `GET /admin/health` (with `RELAY_ADMIN_TOKEN`); `GET /internal/metrics` (Prometheus text); `audit_log` on some actions. |
| **Mobile or desktop client** | Partial / MVP | **`apps/mini-reader`** Vite + SDK read-only list of actors. |
| **Load / soak harness** | Partial / MVP | `load/k6-smoke.js` + `pnpm run load:k6` (k6 must be installed); **`.github/workflows/nightly-load.yml`** for registry + §19 scripts on a schedule. |
| **Registry compliance automation** | Partial | **`pnpm run registry:validate`** in CI; JSON Schema check on `log-event.data.*.json`. **Golden log append** in CI not added. |

When scoping a **phase 2**, pick one vertical (e.g. “replace demo auth with X” or “federated follow proof-of-concept”) instead of all rows at once.
