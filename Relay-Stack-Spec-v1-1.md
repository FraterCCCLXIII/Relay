# Relay v1.1 Stack Spec

This document defines Relay v1.1 in three layers:

1. Wire protocol + APIs
2. Reference server + relay implementation
3. Client architecture

---

## Part I — Relay v1.1 Wire Protocol + APIs

### 1. Protocol roles

Relay v1.1 defines five interoperable roles:

* **Actor Origin**: authoritative publisher for an actor's mutable state and identity snapshots
* **Feed Host**: serves signed log segments and state snapshots over HTTP
* **Fast Relay**: low-state WebSocket service for live distribution
* **Mirror Node**: caches signed public artifacts for resilience
* **Indexer**: builds search, channel, and discovery views from public artifacts

A single deployment may implement one or more roles.

### 2. Transport model

Relay uses:

* **HTTPS/HTTP** for durable fetch, publication, snapshots, and object retrieval
* **WebSocket** for live sync, notifications, and low-latency fan-out
* **Optional P2P transport** as a compatible mirror/fetch layer, not a required core transport

HTTP is the source-of-truth access layer. WebSocket is acceleration only.

### 3. Serialization

All protocol objects MUST use canonical JSON for hashing and signing.

Canonicalization rules:

* UTF-8 encoding
* object keys sorted lexicographically
* no insignificant whitespace
* numbers encoded in normalized decimal form
* signature field excluded from object hash

Identifiers:

* `actor_id`: stable actor identifier, e.g. `relay:actor:<multihash>`
* `object_id`: object identifier, either logical (`post:<uuid>`) or content-addressed (`relay:obj:<hash>`)
* `channel_id`: `relay:channel:<multihash>`
* `label_id`: `relay:label:<hash>`
* `event_id`: `relay:event:<hash>`

### 4. Envelope

All transmitted signed objects SHOULD be wrapped in a common envelope.

```json
{
  "kind": "identity|log|state|label|channel|snapshot|revocation",
  "schema": "relay/v1.1/<kind>",
  "object": {},
  "sig": {
    "alg": "ed25519",
    "key_id": "key:active:1",
    "value": "base64..."
  }
}
```

### 5. Identity document schema

Endpoint:

* `GET /.well-known/relay.json`
* `GET /actors/{actor_id}/identity`

Schema:

```json
{
  "id": "relay:actor:abc",
  "kind": "user|group|organization|bot",
  "handles": ["@alice.example"],
  "keys": {
    "active": [
      {"id": "key:active:1", "alg": "ed25519", "public": "base64..."}
    ],
    "recovery": [
      {"id": "key:recovery:1", "alg": "ed25519", "public": "base64..."}
    ]
  },
  "recovery": {
    "mode": "guardian_threshold|recovery_key|org_admin",
    "threshold": 3,
    "guardians": ["relay:actor:g1", "relay:actor:g2", "relay:actor:g3"]
  },
  "origins": {
    "identity": ["https://alice.example/actors/relay:actor:abc/identity"],
    "log": ["https://alice.example/actors/relay:actor:abc/log/"],
    "state": ["https://alice.example/actors/relay:actor:abc/state/"],
    "relay_hint": ["wss://live.example/ws"]
  },
  "trust_signals": [
    {"type": "continuity_proven", "issuer": "self", "since": "2026-01-01T00:00:00Z"}
  ],
  "mailbox": {
    "profile": "optional",
    "endpoints": ["https://alice.example/mailbox"]
  },
  "updated_at": "2026-04-21T00:00:00Z"
}
```

### 6. Object classes and storage classes

Every user-visible content object MUST declare both:

* `content_class`
* `storage_class`

Allowed values:

* `content_class`: `durable_public|mutable_public|revocable|ephemeral`
* `storage_class`: `log|state|dual`

Rules:

* `durable_public` MAY be `log` or `dual`
* `mutable_public` MUST be `state` or `dual`
* `revocable` MUST be `state`
* `ephemeral` MUST be `state`

`dual` means:

* current renderable version exists as state
* audit/history references exist as log events

### 7. Log event schema

A log event is immutable and append-only.

```json
{
  "id": "relay:event:hash",
  "actor": "relay:actor:abc",
  "prev": "relay:event:prevhash|null",
  "ts": "2026-04-21T00:00:00Z",
  "type": "follow.add|follow.remove|membership.add|membership.remove|label.issue|key.rotate|state.commit|state.delete|state.revoke|channel.accept|channel.remove|trust.attest",
  "target": "optional object id",
  "data": {},
  "content_class": "durable_public",
  "storage_class": "log"
}
```

### 8. State object schema

A state object is origin-authoritative and versioned.

```json
{
  "id": "post:01J...",
  "actor": "relay:actor:abc",
  "type": "post|profile|channel_config|group_profile|media_manifest",
  "version": 4,
  "created_at": "2026-04-21T00:00:00Z",
  "updated_at": "2026-04-21T00:05:00Z",
  "content_class": "mutable_public",
  "storage_class": "state",
  "reply_to": "post:01H...",
  "channel_refs": ["relay:channel:news"],
  "deleted": false,
  "payload": {},
  "meta": {
    "lang": "en",
    "visibility": "global|channel|followers|custom",
    "mime": "text/markdown"
  }
}
```

### 9. Label schema

```json
{
  "id": "relay:label:hash",
  "issuer": "relay:actor:moderator",
  "target": "post:01J...|relay:actor:abc|relay:channel:xyz",
  "label": "spam|harassment|impersonation|nsfw|removed_from_channel|trusted_source|misleading_context",
  "reason": "optional short string",
  "scope": "global|channel:<id>|local_pack",
  "ts": "2026-04-21T00:00:00Z"
}
```

### 10. Channel schema

```json
{
  "id": "relay:channel:tech",
  "owner": "relay:actor:group1",
  "kind": "group|topic|curated|org_stream",
  "created_at": "2026-04-21T00:00:00Z",
  "updated_at": "2026-04-21T00:00:00Z",
  "profile": {
    "name": "Tech",
    "description": "Technology discussion"
  },
  "policy": {
    "trust_floor": ["cryptographic_only"],
    "posting": "open|members|approved",
    "indexable": true
  },
  "content_class": "mutable_public",
  "storage_class": "state"
}
```

### 11. Classification decision rules

Deterministic rule set:

1. If the object changes authority, membership, keys, moderation, recovery, or audit trail, it MUST be a `log` object.
2. If the object is primarily rendered as the current user-facing version, it MUST be a `state` object.
3. If both current renderability and durable audit history matter, it MUST be `dual` and emit a `state.commit` log event for every accepted state mutation.
4. Reply structure is stored on the post state object (`reply_to`) while reply arrival events may be indexed from state commits.
5. Channel membership actions are `log`; current channel profile/config is `state`.
6. Edit history is never implicit. If a client wants user-visible history, the object MUST be `dual`.

### 12. Unified semantics matrix

| Object Type           | Content Class  | Storage Class |  Mutable | Mirror Expectation      | Delete Semantics           |
| --------------------- | -------------- | ------------: | -------: | ----------------------- | -------------------------- |
| Identity              | durable_public |          dual |  limited | mirror snapshots        | superseded, not erased     |
| Follow event          | durable_public |           log |       no | mirror indefinitely     | none                       |
| Membership action     | durable_public |           log |       no | mirror indefinitely     | none                       |
| Moderation label      | durable_public |           log |       no | mirror indefinitely     | superseded by later labels |
| Public post           | mutable_public | state or dual |      yes | mirror latest state     | origin delete + tombstone  |
| Essay/article         | durable_public |          dual | optional | mirror latest + commits | suppression only           |
| Revocable shared post | revocable      |         state |      yes | mirror ciphertext only  | key revoke + tombstone     |
| Ephemeral post        | ephemeral      |         state |      yes | short TTL cache only    | expiry + best-effort purge |
| Channel profile       | mutable_public |         state |      yes | mirror latest           | origin update              |

### 13. Publication APIs

#### 13.1 Publish state object

`PUT /actors/{actor_id}/state/{object_id}`

Request body: state envelope

Rules:

* requires actor auth
* version MUST increment by 1 unless creating version 1
* server validates signature and schema
* on success, server persists latest state and MAY emit `state.commit` log event if object is `dual`

Response:

```json
{
  "ok": true,
  "actor": "relay:actor:abc",
  "object_id": "post:01J...",
  "version": 4,
  "etag": "W/\"state-4\""
}
```

#### 13.2 Soft-delete state object

`DELETE /actors/{actor_id}/state/{object_id}`

Effect:

* server marks state object `deleted=true`
* increments version
* emits `state.delete` log event for `dual` objects
* for `revocable`, also marks current key grants revoked

#### 13.3 Append log event

`POST /actors/{actor_id}/log`

Body: log envelope

Validation:

* `prev` MUST match current head unless explicit fork mode is enabled
* `type` MUST be permitted for actor role

Response:

```json
{
  "ok": true,
  "event_id": "relay:event:hash",
  "head": "relay:event:hash"
}
```

### 14. Fetch APIs

#### 14.1 Identity

* `GET /actors/{actor_id}/identity`

#### 14.2 Actor log head

* `GET /actors/{actor_id}/log/head`

Response:

```json
{"head": "relay:event:hash", "count": 2412}
```

#### 14.3 Log event by ID

* `GET /actors/{actor_id}/log/events/{event_id}`

#### 14.4 Log range

* `GET /actors/{actor_id}/log?after=<event_id>&limit=100`
* `GET /actors/{actor_id}/log?before=<event_id>&limit=100`

#### 14.5 State object

* `GET /actors/{actor_id}/state/{object_id}`

#### 14.6 State feed snapshot

* `GET /actors/{actor_id}/state?type=post&after_ts=...&limit=50`

#### 14.7 Channel view

* `GET /channels/{channel_id}`
* `GET /channels/{channel_id}/feed?cursor=...&limit=50`

#### 14.8 Label view

* `GET /labels?target=<id>&scope=<scope>`

### 15. WebSocket relay protocol

Endpoint:

* `GET /ws`

Message envelope:

```json
{
  "op": "HELLO|SUB|UNSUB|PUB|EVENT|STATE|LABEL|ACK|ERROR|PING|PONG",
  "req_id": "client-generated-id",
  "body": {}
}
```

#### 15.1 HELLO

Client introduces itself.

```json
{
  "op": "HELLO",
  "req_id": "1",
  "body": {
    "client": "relay-web/0.1",
    "actor": "relay:actor:abc",
    "auth": {
      "nonce": "server-provided or omitted",
      "sig": "optional actor signature"
    },
    "supports": ["state_push", "label_push", "channel_subscriptions"]
  }
}
```

#### 15.2 SUB

Subscribe to topics.

Supported subscription types:

* actor log head changes
* actor state changes
* channel feed changes
* label changes for target
* relay announcements

```json
{
  "op": "SUB",
  "req_id": "2",
  "body": {
    "subscriptions": [
      {"type": "actor_state", "actor": "relay:actor:abc"},
      {"type": "channel_feed", "channel": "relay:channel:tech"}
    ]
  }
}
```

#### 15.3 PUB

Push signed object to relay for fan-out.

```json
{
  "op": "PUB",
  "req_id": "3",
  "body": {
    "kind": "state|log|label",
    "envelope": {}
  }
}
```

Relay behavior:

* validate envelope signature and schema
* optionally persist short-term cache
* fan out matching subscriptions
* relay does not become authoritative unless coupled with an origin service

#### 15.4 EVENT / STATE / LABEL

Server push message.

```json
{
  "op": "STATE",
  "req_id": "sub-2",
  "body": {
    "actor": "relay:actor:abc",
    "object_id": "post:01J...",
    "version": 4,
    "origin": "https://alice.example",
    "envelope": {}
  }
}
```

### 16. Auth model

For publication and actor-bound mutation:

* HTTP auth SHOULD use one of:

  * signed request headers with actor key
  * OAuth-style bearer token bound to actor identity
  * session token from authenticated origin

Minimum signed header profile:

* `X-Relay-Actor`
* `X-Relay-Timestamp`
* `X-Relay-Nonce`
* `X-Relay-Signature`

Server verifies actor key from identity doc.

### 17. Revocable and ephemeral APIs

#### 17.1 Key grant retrieval

`GET /actors/{actor_id}/keys/{key_id}`

Returns wrapped content-key grants for authorized clients.

#### 17.2 Key revoke

`POST /actors/{actor_id}/keys/{key_id}/revoke`

Body:

```json
{"reason": "delete|membership_change|manual_revoke"}
```

Server effect:

* publishes `state.revoke` log event
* stops serving future grants

Important semantic note:

* revocation prevents future authorized reads only
* it does not erase prior plaintext copies

### 18. Error model

All APIs return structured errors.

```json
{
  "ok": false,
  "error": {
    "code": "invalid_signature|conflict_version|unknown_actor|forbidden|unsupported_extension|schema_error|fork_detected",
    "message": "human-readable detail"
  }
}
```

### 19. Extension model

Objects MAY include:

* `ext`: array of extension identifiers
* `ext_payload`: namespaced extension data

Example:

```json
{
  "type": "post",
  "ext": ["relay.ext.richtext.v1"],
  "ext_payload": {
    "relay.ext.richtext.v1": {"format": "markdown"}
  }
}
```

---

## Part II — Reference Server + Relay Implementation

### 20. Deployment topology

Reference implementation is split into three services plus optional extras:

1. **Origin API**

   * authoritative identity + state + log write path
2. **Static Feed Host**

   * serves immutable log chunks and state snapshots
3. **Fast Relay Service**

   * WebSocket fan-out and short-lived caches
4. **Optional Indexer**

   * search, channel aggregation, and discovery views

A small install may run Origin API + Static Feed Host + Fast Relay in one process.

### 21. Recommended stack

Reference choices:

* language: TypeScript/Node for fastest ecosystem reach, or Go for simpler deployment and lower memory
* durable database: PostgreSQL
* blob/object storage: S3-compatible bucket or local object store
* cache/pubsub: Redis or NATS
* WebSocket: native ws server or NATS-backed gateway

### 22. Core modules

#### 22.1 Identity module

Responsibilities:

* resolve and serve identity docs
* key lookup
* guardian recovery workflows
* trust signal attestation storage

Tables:

* actors
* actor_keys
* guardians
* handles
* trust_signals

#### 22.2 State module

Responsibilities:

* validate state object writes
* maintain latest state per object
* maintain version history if enabled
* emit commit hooks

Tables:

* state_objects_latest
* state_versions (optional but recommended)
* object_tombstones

#### 22.3 Log module

Responsibilities:

* append validated events
* maintain head pointer per actor
* expose pagination and range queries
* detect forks/conflicts

Tables:

* log_events
* actor_log_heads
* log_forks

#### 22.4 Channel module

Responsibilities:

* channel state
* membership actions
* acceptance/removal refs
* policy resolution

Tables:

* channels
* channel_membership_events
* channel_content_refs

#### 22.5 Label module

Responsibilities:

* store and query labels
* scope filtering
* issuer authenticity

Tables:

* labels
* label_targets

#### 22.6 Relay module

Responsibilities:

* websocket sessions
* subscriptions
* fan-out
* rate limits
* short-term object cache

In-memory or Redis-backed structures:

* sessions
* subscription_index
* rate_limit_buckets
* relay_recent_cache

### 23. Publication flow

#### 23.1 State publish flow

1. authenticate request
2. parse + canonicalize object
3. verify signature
4. validate schema + content/storage class pairing
5. compare version against latest
6. upsert latest state
7. persist version history if enabled
8. emit event to message bus
9. if `storage_class=dual`, append `state.commit` log event
10. notify Fast Relay
11. asynchronously write snapshot/update to object storage

#### 23.2 Log append flow

1. authenticate request
2. canonicalize + verify signature
3. validate `prev`
4. append row
5. update head pointer
6. write immutable chunk or append segment file
7. notify Fast Relay

### 24. Feed hosting layout

Static layout suggestion:

```text
/actors/{actor_id}/identity.json
/actors/{actor_id}/log/head.json
/actors/{actor_id}/log/chunks/000001.jsonl
/actors/{actor_id}/log/chunks/000002.jsonl
/actors/{actor_id}/state/latest/posts/{object_id}.json
/actors/{actor_id}/state/latest/profile.json
/channels/{channel_id}.json
```

Log chunks SHOULD be append-once immutable JSONL segments.

### 25. Snapshot strategy

To reduce polling cost:

* generate actor state snapshots every N writes or T minutes
* include object IDs, versions, updated timestamps, and hashes

Endpoint:

* `GET /actors/{actor_id}/snapshots/latest`

### 26. Relay implementation behavior

Fast Relay is explicitly non-authoritative.

Responsibilities:

* accept authenticated or anonymous subscriptions
* accept signed pub pushes from origins or clients
* deduplicate by object/event ID
* fan out matching updates
* optionally cache recent updates for replay window

Non-responsibilities:

* permanent storage
* canonical history
* trust adjudication beyond local relay policy

### 27. Relay replay window

Recommended:

* keep 1 to 30 minutes of recent updates in memory or Redis
* allow reconnecting clients to request replay since last seen cursor

Endpoint via WebSocket message:

```json
{
  "op": "SUB",
  "req_id": "9",
  "body": {
    "subscriptions": [{"type": "channel_feed", "channel": "relay:channel:tech"}],
    "since": "relay:cursor:12345"
  }
}
```

If replay unavailable, client falls back to HTTP snapshot.

### 28. Rate limiting and abuse control

Reference server policies:

* per-IP and per-actor publish rate limits
* per-relay session subscription limits
* per-channel submission throttles
* optional relay write fees or membership policies

Policy surfaces MUST be inspectable by clients.

Suggested endpoint:

* `GET /relay/policy`

### 29. Consistency model

State:

* origin is authoritative
* last valid version wins
* equal version with different payload = conflict

Log:

* append-only
* forks are recorded, never silently collapsed
* recovery-key-signed supersession may resolve identity forks

### 30. Recovery workflows

#### 30.1 Guardian recovery

1. actor requests recovery challenge
2. origin publishes pending recovery object
3. guardians submit signatures
4. waiting period begins
5. original key may veto during delay
6. if not vetoed and threshold met, new active key becomes valid
7. origin emits `key.rotate` and identity update

### 31. Optional P2P support

Reference implementation MAY add a fetch/mirror daemon:

* announces available actor feed chunks
* serves cached immutable log chunks and public state snapshots
* never becomes sole required path

This allows pure P2P survival mode without making it the primary UX path.

---

## Part III — Client Architecture

### 32. Client goals

A Relay client should:

* own keys safely
* render current state consistently
* preserve local moderation control
* sync reliably over flaky networks
* degrade gracefully from live relay to HTTP polling

### 33. Client layers

#### 33.1 Identity & key manager

* actor keys
* recovery config viewer
* device session keys
* optional secure enclave / OS keychain integration

#### 33.2 Local store

Use a normalized local database (SQLite/IndexedDB).

Suggested stores:

* actors
* identities
* log_events
* state_latest
* state_history_refs
* labels
* channels
* subscriptions
* sync_cursors
* relay_policies

#### 33.3 Sync engine

Responsibilities:

* bootstrap identity
* fetch snapshots
* subscribe to Fast Relay
* reconcile state updates
* detect divergence and refetch from origin

#### 33.4 Policy engine

Responsibilities:

* apply local moderation rules
* merge labels from selected sources
* apply channel policy and trust floors
* compute final visibility state

#### 33.5 Composer/publisher

Responsibilities:

* build canonical objects
* sign locally
* publish to origin
* optionally push to relay for fast fan-out

### 34. Client sync flow

#### 34.1 Bootstrap

1. resolve identity doc
2. fetch actor snapshot(s)
3. fetch log head(s) if needed
4. populate local store
5. connect to one or more relays from origin hints or user config
6. subscribe to followed actors/channels

#### 34.2 Live sync

When relay sends update:

1. verify envelope signature
2. if state object version is newer than local, apply
3. if version skips beyond one and object is important, schedule origin fetch
4. update UI from local store
5. store cursor for replay

#### 34.3 Reconnect flow

1. reconnect to previous relay(s)
2. request replay from last cursor
3. if replay gap, fetch HTTP snapshot from origin
4. reconcile

### 35. Timeline architecture

The client timeline is a projection, not a protocol object.

Pipeline:

1. collect followed actor posts + channel accepted refs
2. filter through policy engine
3. sort according to selected timeline strategy
4. render from local state cache

The protocol does not mandate ranking.

### 36. Channel integration

Client keeps separate concepts for:

* authorship (post owner)
* inclusion (channels referencing or accepting a post)
* moderation (labels and channel removal actions)

A post removed from a channel is not erased from the actor profile unless locally filtered.

### 37. Edit/delete UX semantics

The client MUST present different semantics by content class:

* `durable_public`: “Public and durable; deletion is suppressive only.”
* `mutable_public`: “Public; latest version is authoritative.”
* `revocable`: “Future access can be revoked for authorized viewers.”
* `ephemeral`: “Time-bounded visibility only; recipients may still retain copies.”

This warning should be visible at compose time, not hidden.

### 38. Offline mode

Client MUST support:

* local draft composition
* delayed publish queue
* cached reading of synced state/logs
* eventual resend when origin/relay available

If pure P2P add-on exists, client MAY fetch public cached chunks from peers.

### 39. Multi-account architecture

Recommended model:

* one workspace
* multiple actor identities
* per-identity key storage
* per-identity relay/origin preferences
* shared but partitioned local cache

### 40. Security architecture

Client SHOULD:

* store private keys in OS keychain/secure enclave where possible
* never send raw private keys to origin or relay
* sign locally
* verify every incoming signature before durable local commit
* isolate extension rendering from core data model

### 41. Extension handling

Clients advertise supported extensions and degrade gracefully.

If an object includes unsupported required extension:

* display fallback metadata
* do not mutate object in incompatible ways
* preserve unknown extension payloads when reserializing if acting as editor/proxy

### 42. Minimal screens / surfaces

A usable reference client should include:

* identity/profile view
* home timeline
* channel view
* post detail thread view
* moderation settings
* trust signal view
* compose/edit/delete flows
* relay/origin diagnostics
* recovery settings

### 43. First implementation recommendation

Reference client stack:

* web: React + TypeScript + IndexedDB
* desktop/mobile later via shared state engine
* transport abstraction supporting HTTP + WebSocket first

### 44. MVP cut line

For a realistic first build, implement in this order:

#### Server MVP

* identity docs
* publish/fetch state
* append/fetch log
* static snapshots
* basic WebSocket relay fan-out
* channel refs
* labels

#### Client MVP

* single-account login
* follow actors
* home timeline from followed actors
* channel browse
* compose/edit/delete mutable public posts
* local moderation filters
* relay reconnect + snapshot fallback

#### Deferred

* guardian recovery UX
* revocable/ephemeral content
* optional P2P daemon
* extension registry UI
* advanced indexer/search

---

## Closing summary

Relay v1.1 is a hybrid protocol stack:

* **HTTP** provides authoritative fetch and publication
* **WebSocket relays** provide fast fan-out and replay windows
* **static feed hosting** provides durability and cheap mirroring
* **optional P2P** provides resilience, not the primary UX path
* **clients own keys and local policy**

This architecture is intended to be straightforward to implement, resistant to silent centralization, and honest about where authority actually lives.
