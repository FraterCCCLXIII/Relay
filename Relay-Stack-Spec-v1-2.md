
# Relay v1.2 Stack Spec

This document defines the Relay stack in three layers:

1. Wire protocol + APIs (Part I)
2. Reference server + relay implementation (Part II)
3. Client architecture (Part III)

## Status, versioning, and normative scope (v1.2)

* **v1.1 → v1.2** is an interoperability and correctness upgrade. Unless this document says otherwise, v1.2 is **backward compatible** with v1.1 and tightens spec text where v1.1 was ambiguous.
* **Normative (required for interoperability):** Part I — object schemas, canonicalization, hashing, conflict resolution, auth model, content semantics, and sync rules as stated.
* **Non-normative (reference only):** Part II and Part III. Implementations **MAY** deviate.

### Deferred to the next specification revision (explicit v1.2 → future)

The following are **out of scope for v1.2** and **scheduled for a future core specification revision** (exact version TBD). This section is the **single checklist** of that intent; the cited sections describe **current** v1.2 behavior only.

| Topic | Target deliverable (next revision) | v1.2 anchor |
| --- | --- | --- |
| **Portable membership** | Normative **membership witness** / portable proof that an actor held channel membership at a given time (e.g. Merkle path, signed attestation chain), so verifiers and relays need not trust the origin alone. | **§13.1** |
| **Global channel identity** | **Canonical channel genesis** bytes and **global** (or cross-origin) **channel identity** / deduplication rules for `channel_id`. | **§4.3**, **§23.2** |
| **Capability advertisement** | **Origin capability** surface (document or endpoint) **separate from** the actor **identity** document, so **server offers** and **human identity** can version independently. | **§8** (`relay_profiles` note) |
| **Registry / log `data` coverage** | **Broader normative** interop for **log event `data`** beyond the **Appendix B** MVP five types—i.e. next-revision **core** or **tier-1 registry** rules so additional `type` values are not only companion **`registry/`** drafts. | **§10.2**, **§22.1**, **`registry/`**, **Appendix B** |

---

## Part I — Wire Protocol + APIs (normative, v1.2)

### 1. Protocol roles

Relay defines five interoperable roles:

* **Actor Origin**: authoritative publisher for an actor's mutable state and identity snapshots
* **Feed Host**: serves signed log segments and state snapshots over HTTP
* **Fast Relay**: low-state WebSocket service for live distribution
* **Mirror Node**: caches signed public artifacts for resilience
* **Indexer**: builds search, channel, and discovery views from public artifacts. Indexers can become **power centers** for discovery; deployments that expose an Indexer role **SHOULD** also expose the **transparency** endpoints in **§17.9** so clients can see **policy** and **sources** (ranking inputs) without scraping HTML.

A single deployment may implement one or more roles.

### 2. Relay profiles and interoperability (v1.2, normative)

Relay defines **conformance profiles** so that partial implementations can claim interoperable support without implementing the entire Part I at once. Implementations **MUST** declare which profiles they support (see **§2.1** and the **`relay_profiles`** field on the **identity** document, **§8**). Claiming “Relay v1.2 interop” in marketing or security contexts **MUST** be consistent with the declared profiles and the **interoperability baseline** (**§2.5**).

#### 2.1 Profile identifiers

Implementations **MUST** list supported profile URIs. Example on the **identity** document (see **§8**):

```json
"relay_profiles": [
  "relay.profile.minimal",
  "relay.profile.social"
]
```

* **`relay.profile.minimal`:** smallest wire subset for basic social following and state (**§2.2**).
* **`relay.profile.social`:** **minimal** + labels, channels, WebSocket relay, trust attestation objects (**§2.3**).
* **`relay.profile.full`:** **social** + revocable, ephemeral, guardian recovery UX, and **`ext_required`** processing (**§2.4**).

#### 2.2 `relay.profile.minimal`

An implementation that claims **`relay.profile.minimal` MUST** support **all** of the following (normative; ties to this document are cited):

* Identity document resolution (**§8**)
* Canonical JSON, hashing, and signatures: **§4**, **§4.1**–**§4.1.2**, **§4.2**, **§4.3**, **§7.1** (Ed25519)
* **SHA-256** for content-addressed ids (**§4.2**)
* **RFC 9421** HTTP message signatures for origin APIs (**§19**)
* **State** publish and fetch APIs (**§16**; **PUT/GET** state paths in **§16**)
* **Log** append and fetch APIs (**§16**; **POST** log, **GET** log head/range)
* **Conflict** detection and **§5** (including `conflict_detected`, **§21**)
* **Snapshot** fetch (**§17.6**; **GET** `.../snapshots/latest` and snapshot semantics, **Part II §29**)
* **MVP** log `data` and **`target` rules** for required event **types** (**Appendix B**, **§10.2**, **§10.2.1**)
* **Required** log **event** `type` values (must be accepted for append, fetch, and correct `data` / `target` handling): **`follow.add`**, **`follow.remove`**, **`state.commit`**, **`state.delete`**, **`key.rotate`**

#### 2.3 `relay.profile.social`

An implementation with **`relay.profile.social` MUST** support **all** of **`relay.profile.minimal`**, and **additionally**:

* **Label** objects and APIs (**§12**, **§17.8**)
* **Channel** objects and channel views (**§13**, **§17.7**)
* **WebSocket** relay protocol (**§18**, including **security** in **§18.4**)
* **Trust attestation** objects and **§6**

#### 2.4 `relay.profile.full`

An implementation with **`relay.profile.full` MUST** support **all** of **`relay.profile.social`**, and **additionally**:

* **Revocable** and **ephemeral** content and APIs where exposed (**§20**)
* **Guardian recovery** workflows on the **origin** (reference: **Part II §34**; client UX in **Part III**)
* **Extension** model including **`ext_required`**: **§22.3**–**§22.5**

#### 2.5 Interoperability baseline (practical)

Two independent implementations can claim **practical** Relay v1.2 interoperability with each other **if and only if** both **declare** and **implement** **`relay.profile.minimal`**; the full requirement set is **§2.2** (single source of truth—do not duplicate that list here). Profile strings **MUST** be declared in **`relay_profiles`** on the identity document (**§8**) for discoverability.

### 3. Transport model

Relay uses:

* **HTTPS/HTTP** for durable fetch, publication, snapshots, and object retrieval
* **WebSocket** for live sync, notifications, and low-latency fan-out
* **Optional P2P transport** as a compatible mirror/fetch layer, not a required core transport

HTTP is the source-of-truth access layer. WebSocket is acceleration only.

### 4. Serialization, canonicalization, and hashing

All protocol objects MUST use canonical JSON for hashing and signing.

#### 4.1 Canonicalization (normative, unchanged in substance from v1.1)

The following are **REQUIRED** for a canonical serialization:

* UTF-8 encoding
* object keys sorted **lexicographically** (per Unicode code point, byte-wise where applicable for JSON)
* no insignificant **whitespace** (no variable pretty-printing)
* **numbers** per **§4.1.1**; **string** text values per **§4.1.2** where they participate in signed/hashed objects
* the **signature** field (and other designated outer signature fields) **excluded** from the input to `object_id` and signing transforms as specified in this document

#### 4.1.1 JSON numbers and precision (v1.2, normative)

To avoid cross-language hash/signature drift (`1` vs `1.0`, exponent forms, float rounding), the following apply to **all** bytes fed to signing and to **object_id** computation:

1. **No exponent notation:** a JSON `number` **MUST NOT** be serialized with `e` or `E` (e.g. `1e3` and `1E-3` are **invalid** in canonical form).
2. **Integers only for JSON `number`:** any numeric value that is a whole number **MUST** be a JSON `number` with **no** `.` in the text (e.g. `42`, not `42.0` or `1.0`). Lexically, the entire token (optional leading `-`, then digits) **MUST** match:  
   `-?(0|[1-9][0-9]*)`  
   (This implies **no** leading zeros on multi-digit values except a lone `0`.)
3. **No JSON `number` for true fractions or irrationals** in protocol fields: values that are not **mathematical integers** (money, ratios, “1.5”, IEEE floats) **MUST** be carried as:
   * a **JSON string** holding a **decimal** with no exponent (e.g. `"0.1"`, `"3.14159"`) and **no** redundant leading zeros in the **integer** part, **or**
   * a **JSON integer** in a **defined smallest unit** in the object schema (e.g. “nanocoins” as a `uint64`), **or**
   * an **extension-registered** encoding.
4. **Strings for precision-sensitive** amounts in core objects **MUST** use the decimal string pattern above; implementations **MUST NOT** round-trip them through a binary float before hashing.
5. **max precision** for string decimals is not capped in v1.2, but a given object schema **MUST** document allowed scale; extensions **MUST** reject out-of-scale values for interop.

If an implementation cannot represent a value without violating these rules, it **MUST** reject the object (or use an allowed string/integer form) before signing or hashing.

#### 4.1.1.1 Instants and timestamps (v1.2, normative)

* **This is not a “fraction” issue:** all **time instants** in **protocol** objects (including log **`ts`**, state **`created_at` / `updated_at`**, attestation **`ts` / `expires_at`**, identity **`updated_at`**, and any other core- or registry-defined field whose name ends in **`_at`**, **`_ts`**, or is explicitly documented as an instant) **MUST** be **RFC 3339** **strings** (e.g. `2026-04-21T00:00:00Z` or with a numeric offset). **Unix epoch in a JSON `number` (seconds or milliseconds)** and **stringified epoch digits** are **invalid** for these fields in v1.2 interop—using them will **not** match peers’ canonical objects.
* **Calendar dates** (no time of day) **MUST** still use an RFC 3339 **full** instant at **00:00:00Z** for that day unless an extension defines a `date` string pattern.

#### 4.1.2 JSON strings, Unicode, and escaping (v1.2, normative)

* **Encoding:** the outer document **MUST** be **UTF-8** (as required of JSON in interchange).
* **Unicode normalization:** for **all string values** that are part of a **signed** or **hashed** object, implementations **MUST** apply **[Unicode NFC](https://www.unicode.org/reports/tr15/)** (Canonical Composition) **before** computing **digests**, **before** **signing**, and **before** **signature verification** that recomputes canonical signed material, so that **visually** identical user text in different NFD vs NFC **does not** yield different **`object_id`**s or broken cross-implementation verification. (This is **not** optional at the base layer: two compliant implementations **MUST** agree on the bytes hashed.) UI **MAY** still apply locale rules for **display** only; the **wire and crypto** canonical form for those strings is **NFC**.
* **JSON escaping** (on the wire, after NFC where applied): string contents **MUST** be serialized with **[RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)-compatible** escaping (`\"`, `\\`, `\u` where required) as produced by a conforming JSON generator; the **byte sequence** fed to a digest is the **minimally** escaped UTF-8 JSON for that value **after** the rules above, without optional pretty-printing.
* If two different NFC strings are **semantically** equal under another Unicode rule (e.g. compatibility), v1.2 does **not** collapse them; **NFC** is the defined canonicalization for protocol strings.

#### 4.2 Hashing and content addressing (v1.2, required)

* Relay v1.2 **MUST** use **SHA-256** for all **content-addressed** identifiers in the base protocol:  
  `object_id = "relay:obj:" + lower_hex(SHA-256(UTF-8 bytes of canonical JSON(object payload without signature fields)))`  
  (Implementations that use a logical `object_id` such as `post:<uuid>` for some objects are unchanged; this requirement applies to `relay:obj:…` and any operation defined as "content addressed".)
* **Rationale:** wide support, cross-language stability, ecosystem familiarity.
* **Future algorithms:** implementations **MAY** support additional digests (e.g. BLAKE3) via a documented **extension** that carries, for example:  
  `{ "hash_alg": "blake3", "id": "relay:obj:blake3:…" }`  
  Conforming v1.2 clients **MUST** implement and accept **SHA-256**; other algorithms are optional.

**Identifiers (including logical ids where specified):**

* `actor_id`: stable actor identifier, `relay:actor:` + **multihash** (see **§4.3**)
* `object_id`: either logical (e.g. `post:<uuid>`) or content-addressed per §4.2
* `channel_id`: `relay:channel:` + **multihash** (format under **§4.3**; **canonical channel genesis** / **global channel identity** are **deferred** to the **next specification revision**—see **Deferred to the next specification revision** in document status)
* `label_id`: `relay:label:<hash>`
* `event_id`: `relay:event:<hash>`

#### 4.3 `actor_id` and `channel_id` (multihash) — v1.2, normative for `actor_id`

A [multihash](https://github.com/multiformats/multihash) value encodes which digest algorithm was used. For interoperability, **independent implementations must agree on the byte string being hashed and on SHA-256** when minting a new `actor_id`.

* **`actor_id` (MUST):** `actor_id` **MUST** be `relay:actor:` + a multihash with **SHA-256** (code `0x12`, 32-byte digest) over the **32-byte raw Ed25519 public key** bytes of the primary active key (the same key material that appears, base64-encoded, in the identity document’s `keys.active` entry; implementations **MUST** decode to raw 32 bytes before hashing). Implementations **MUST NOT** hash alternate encodings (PEM, JWK, base64 string, etc.) for `actor_id` unless a future spec defines a different canonical public-key byte form.
* **`channel_id` (deferred):** `relay:channel:` + multihash appears throughout this document, but the **input bytes** for channel minting (what gets SHA-256’d) are **not** normatively defined in v1.2. Interoperability is therefore by **opaque** `channel_id` as published by an origin, not by recomputing the ID in every client. There is **no** protocol-level deduplication of “the same” logical channel across **two** origins (see **§23.2**). **Canonical channel genesis** and **global channel identity** are **deferred to the next specification revision** (see **Deferred to the next specification revision** in document status); until then, an **extension** **MAY** experiment with channel-creation payloads without being core-normative.

### 5. Conflict resolution (v1.2, normative)

#### 5.1 State object conflicts

**Conflict** when: same `object_id` **and** same `version` **and** different payload.

**REQUIRED** client behavior when a state conflict is detected (including on mirror/replica):

* mark the object as **conflicted** in local UI and sync state
* **fetch the authoritative** version from the **origin**; **origin** is **authoritative**
* **replace** local state with the origin’s version
* **retain** optional conflict **metadata** (expected version, local snapshot id, timestamps) for **diagnostics**

#### 5.2 Mirror behavior

* mirrors **MAY** temporarily store multiple conflicting state versions
* mirrors **MUST NOT** present a non-authoritative version as the **authoritative** current state
* mirrors **SHOULD** refetch from **origin** when a conflict is detected

#### 5.3 Log conflicts (forks)

* log forks (divergent `prev` chains) **MUST NOT** be collapsed or merged **silently**
* divergent branches **MUST** be **preserved**; clients and servers that surface history **MAY** show multiple heads or fork metadata

**Client requirements:**

* **MAY** display a fork **warning** and require user choice
* **MAY** prefer the **longest** valid signed chain (policy-dependent)
* **MUST NOT** **discard** signed events that are **valid** under the object’s verification rules (unless overridden by a higher-layer policy, e.g. legal hold, which is out of band to this spec)

#### 5.4 Identity fork resolution (recovery)

If a **recovery key** (or an equivalent recovery path defined in the identity document) signs a **new** identity document that supersedes a prior one:

* the new identity document **supersedes** the previous chain for protocol purposes where recovery authority applies
* clients **MUST** **prefer** the **recovery-signed** valid chain per local validation policy when both appear

#### 5.5 Multi-device versioning (v1.2, non-normative pattern)

The wire rule stays: each successful state write **MUST** use `version = previous + 1` for the same `object_id` (**§16.1**). Two devices that are **offline** can each produce a write they believe is “next,” colliding at the same integer **version** when they come online—**§5.1** applies (origin wins, client reconciles). That behavior is **correct** but can produce **frequent conflict churn** for hot objects.

**Optional** (not required for v1.2 interop): implementations **MAY** attach a stable **`device_id`** (string, e.g. UUID) and a monotonic per-device **`write_seq`** (integer) in **`ext_payload`** or a documented profile for **diagnostics** and **UI** (show “edited on phone vs laptop”). A future core or **extension** **MAY** define a **composite** logical clock (e.g. `(version, device_id)` or Lamport time). This document does **not** replace the integer **`version`** field for **authoritative** ordering at the origin.

#### 5.6 Conflict handling — client guidance (v1.2, non-normative; strongly recommended)

When a state **conflict** is detected (**§5.1**), **clients** **SHOULD**:

* mark the local object as **conflicted** in UI and sync state
* show a **user-visible** notice (e.g. “updated elsewhere”)
* offer **resolution** paths such as: **overwrite** with the **origin** version; **copy** local edits to a **new draft**; show a **diff** when the client can compute one

**Diagnostic metadata:** clients **MAY** store **`device_id`** / **`write_seq`** (as in **§5.5**) alongside conflict records for support and debugging. This is **not** a substitute for **origin** authority.

### 6. Trust attestation model (v1.2, normative)

#### 6.1 Trust signals are not self-validating

Any **trust signal** (including those embedded in an identity or profile surface) **MUST** be backed by a **verifiable** **Trust Attestation Object** (or a normatively equivalent signed record) when “trust” is asserted in any interoperable way. Bare strings in a profile without a corresponding attestation object are **advisory** only.

#### 6.2 Trust attestation object schema

A trust attestation is a signed, addressable object. Example:

```json
{
  "id": "relay:attestation:hash",
  "issuer": "relay:actor:issuer",
  "subject": "relay:actor:target",
  "type": "domain_verified|social_vouch|org_verified|continuity_proven|proof_of_personhood",
  "evidence": {},
  "ts": "2026-04-21T00:00:00Z",
  "expires_at": "optional RFC3339 Z",
  "supersedes": "optional relay:attestation:…",
  "sig": "…"
}
```

* **`expires_at` (optional):** if present and in the **past**, the attestation **MUST** be treated as **invalid** for new trust decisions (existing UIs **MAY** show “expired”).
* **`supersedes` (optional):** if present, this attestation **explicitly** replaces the earlier id for display and policy; if absent, newer attestations with the same `(issuer, subject, type)` and a **later** `ts` (and still valid / unrevoked) **SHOULD** be preferred over older ones for the same trust claim.

The protocol does **not** require a **global** trust hierarchy: verifiers **MUST** apply **local** policy to whether an issuer is accepted.

#### 6.3 Verification rules (by type)

| Type | Typical issuer | Verification expectation |
| --- | --- | --- |
| `continuity_proven` | self / origin | consistent timestamps + account/history evidence per implementer |
| `domain_verified` | domain / DNS controller | DNS (or supported) **challenge** bound to the actor or origin |
| `social_vouch` | another actor | **issuer** signature over subject; optional external proof in `evidence` |
| `org_verified` | org actor | org signature + (optional) **trusted org** list in client policy |
| `proof_of_personhood` | external system | **extension-specific** validation rules |

`proof_of_personhood` and other non-core types are **extensible**; clients **MUST** treat unknown `type` values as **unverified** unless the extension is understood.

#### 6.4 Client responsibility

Clients **MUST**:

* verify the **attestation** signature
* verify the **issuer** identity (per normal identity rules)
* apply **local** trust **policy** for allow/deny (this document does not define a global trust hierarchy)

#### 6.5 Revocation and supersession

* **Revocation:** an issuer **MAY** publish a **`trust.revoke`** log event (see **§10**) that references an attestation `id` (and optionally reason). Verifiers **MUST** treat that attestation as **revoked** for new trust decisions after the revoke is accepted (ordering by log). **Compromised issuers** or **withdrawn** social vouches are handled by **revoke** + local policy.
* **Expiration:** see **`expires_at`** on the attestation object; no separate log event is required for time-only expiry.
* **Supersession:** a **new** attestation with a **later** `ts` (and valid signature, not revoked, not expired) **supersedes** a prior one for the same **claim** when verifiers would otherwise show duplicate lines; `supersedes` **MAY** make the link explicit.

#### 6.6 Trust display (v1.2, non-normative)

**Clients** **SHOULD** visually distinguish **verified** attestations, **self-asserted** or **unverified** signals, **expired** attestations, and **revoked** attestations.

**Clients** **SHOULD NOT** give **unverified** signals the **same** prominence (placement, copy, or trust chrome) as **cryptographically verified** attestations when both appear together.

### 7. Envelope

All transmitted signed objects SHOULD be wrapped in a common envelope.

```json
{
  "kind": "identity|log|state|label|channel|snapshot|revocation",
  "schema": "relay/v1.2/<kind>",
  "object": {},
  "sig": {
    "alg": "ed25519",
    "key_id": "key:active:1",
    "value": "base64..."
  }
}
```

#### 7.1 Signature algorithms (v1.2, normative)

* **Interoperable core** signing for envelopes and for identity `keys` entries **MUST** use **Ed25519** (`"alg": "ed25519"` in `sig` and in key records). The **`value`** field **MUST** be the **signature** bytes under that algorithm (encoding per deployment profile, e.g. base64), verifiable with the **raw** public key in the same actor’s identity document.
* **Other algorithms** (e.g. P-256, post-quantum) **MUST NOT** be used as a silent substitute for `ed25519` on the wire. They **MAY** be added only via a **documented `relay.ext.*`** (or a future **core** revision) that defines: wire encoding, how `sig` and keys are extended, and verification for that profile. A consumer that does not support that extension **MUST** treat the object as **unverified** (or **reject** the operation) rather than assert a false positive.
* **Agility / downgrade:** a bare change of `"alg": "…"` without a versioned, registered extension (or a **schema** version bump) **MUST** be **rejected** as invalid for v1.2 interop.

### 8. Identity document schema

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
    {
      "type": "continuity_proven",
      "issuer": "self",
      "since": "2026-01-01T00:00:00Z",
      "attestation": "relay:attestation:…"
    }
  ],
  "mailbox": {
    "profile": "optional",
    "endpoints": ["https://alice.example/mailbox"]
  },
  "relay_profiles": [
    "relay.profile.minimal",
    "relay.profile.social"
  ],
  "updated_at": "2026-04-21T00:00:00Z"
}
```

* **`relay_profiles`:** an array of **profile identifier** strings the implementation claims (**§2**). It **MUST** be present for **new** v1.2 interop; empty array means “no claim” (not recommended for public services).

**Note (non-normative, forward-looking):** `relay_profiles` lives on the **identity** document, which **mixes** human/actor identity with **server capability** advertisement. That is **convenient** for v1.2 discovery. **Separating capability advertisement from identity** (dedicated **origin capability** document or endpoint) is **deferred to the next specification revision**—see **Deferred to the next specification revision** in document status.

`trust_signals` entries **SHOULD** include an `attestation` (or `attestations`) reference to a **Trust Attestation object** (see §6) when the signal is claimed for interoperability. Legacy inline-only hints (without a resolvable attestation) remain **advisory**.

### 9. Object classes and storage classes

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

#### 9.1 Log/state integration (dual, v1.2)

If an object needs **both**:

* a **current renderable** authoritative state, and  
* a durable **audit** trail on the log,

then `storage_class` **MUST** be `dual`. The system **MUST**:

* keep the **latest** accepted version in **state** storage
* emit a matching **log** event for each state transition that matters for audit, at minimum:

  * **create** → `state.commit`
  * **edit** → `state.commit`
  * **delete** (tombstone / soft delete) → `state.delete`
  * **revoke** (revocable content / key grant) → `state.revoke`

### 10. Log event schema

A log event is immutable and append-only.

For `dual` objects, the **required** interaction between state and log is specified in **§9.1** (e.g. `state.commit` / `state.delete` / `state.revoke` as applicable).

#### 10.1 Genesis and `prev` (v1.2, normative)

* **`prev` type:** the field **`prev`** is either a **string** event id (`"relay:event:…"`) or JSON **`null`**. It is **not** the string `"null"`.
* **Genesis:** the **first** event in an actor’s log chain (the **head** of a new chain) **MUST** use **`"prev": null`**. A receiver **MUST** treat `prev === null` (after JSON parsing) as “no logical predecessor in this chain.”
* **Detection:** clients **MUST** accept well-formed genesis events (`prev: null`). When walking **backward** along `prev`, the walk **stops** at that genesis event. If an actor has **multiple** heads or multiple incompatible genesis chains, apply **§5.3** (forks), not silent merge.

#### 10.2 The `data` object (v1.2, intentionally incomplete for most types)

The `data` object carries event-type–specific fields. v1.2 **normatively** defines the **envelope** (including `type`, `prev`, signatures) and, where referenced elsewhere, a few **cross-links** (e.g. `state.*` in **§9.1**). For **all but the MVP** set below, a complete `data` schema is **deferred** to **Appendix B** (seed), the extension namespace (**§22**), or the companion **`registry/`**. **Broader normative `data` coverage in the core spec** is **deferred to the next specification revision**—see **Deferred to the next specification revision** in document status.

* **MVP / bootstrap (normative in this document):** **Appendix B** is the **instantiated** minimum **`data` JSON** for the event types that almost every first implementation will emit: **`follow.add`**, **`follow.remove`**, **`state.commit`**, **`state.delete`**, **`key.rotate`**. Two implementations that claim **MVP** interop for those `type` values **MUST** use **`data` shapes that are semantically** compatible with **Appendix B** (extra keys in `data` are **allowed**; required keys and types **MUST** match). This removes the “registry exists in theory” bootstrap failure.
* **All other** `type` values: **deferred**; they **SHOULD** be registered under **§22** and documented before broad interop, with **test vectors** where possible.
* **Honest general stance:** a conforming v1.2 implementation **MAY** treat `data` as an open object and validate only what it understands; for unknown `type`+`data` pairs it **MUST** still store and forward the **signed** bytes if it stores the event at all.
* **Divergence risk (remaining):** event types not covered by **Appendix B** can still **diverge** until registered—**Appendix B** only closes the most common path.

**Types not in Appendix B:** there is no **fully specified** `data` schema in the core for those types beyond “JSON object, event-dependent, register before claiming interop.”

```json
{
  "id": "relay:event:hash",
  "actor": "relay:actor:abc",
  "prev": null,
  "ts": "2026-04-21T00:00:00Z",
  "type": "follow.add|follow.remove|membership.add|membership.remove|label.issue|key.rotate|state.commit|state.delete|state.revoke|channel.accept|channel.remove|trust.attest|trust.revoke",
  "target": "object id; required for some type values (see §10.2.1)",
  "data": {},
  "content_class": "durable_public",
  "storage_class": "log"
}
```

`prev` is `null` for genesis (as above) or, for a non-genesis event, a string `relay:event:…` pointing at the previous event. Non-JSON uses of a literal `"null"` string are **invalid** for v1.2.

#### 10.2.1 `target` on log events (v1.2, normative)

* **`follow.add` and `follow.remove`:** `target` **MUST** be present and **MUST** be the `actor_id` (`relay:actor:…`) of the **followed** account. The top-level event **`actor`** is the **follower**; **`target`** is the **followee**. Omitting `target` for these `type` values is **invalid** for v1.2 interop. **`data` remains `{}`** per **Appendix B**—the followed identity is **not** duplicated inside `data`.
* **`key.rotate`:** `target` **MAY** be absent. If present, it **SHOULD** be the `actor_id` of the **identity** being updated (almost always the same as the event **`actor`**). Receivers **MUST** determine which keys are valid from the **signed** log plus the **identity** document **head**, not from `target` alone. Optional **`data.previous_key_id`** (Appendix B) and the published **`keys` list** in identity are the **audit** trail; the **superseded** key **MUST NOT** be used for new signatures once the origin has applied the update (**§7.1**).
* **Other `type` values:** `target` is **optional** unless **Appendix B** or a **registered** profile says otherwise.

#### 10.3 Time ordering, clocks, and monotonicity (v1.2)

* **`ts` fields** **MUST** be **RFC 3339 strings** (see **§4.1.1.1**; **not** Unix epoch integers). They are used for **replay** windows (**§19.4**), attestation order (**§6**), and **UX**; they are **not** a guaranteed **global** total order.
* **Wrong or skewed clocks** on **clients** are partially bounded by **§19.4** (±5 minutes) for **HTTP** requests; for **log** `ts`, a malicious or bad clock can place events in surprising order. **Remedy (optional but useful):** an **origin** or **verifier** **MAY** treat the **append order** of accepted events on the actor’s log as a **monotonic** secondary ordering when `ts` ties or is suspect, as long as that does **not** **silently** drop valid signatures (**§5.3**). Clients **SHOULD** use **`prev` chain** and origin **head** as the source of truth for history, with **`ts`** as a hint.
* **Recommended ordering strategy (non-authoritative, for implementers):** when presenting or merging a **single** actor log view, **(1)** build the event graph from **`prev`** links and the origin-asserted **head**; **(2)** within one branch, sort by **`prev`** traversal order (append order as returned by the origin is a practical proxy when the API exposes it); **(3)** use **`ts`** only as a **tie-break** or **UX** hint where **`prev`** does not impose an order; **(4)** when **forks** exist, **do not** silently merge—surface branches or follow **§5.3** / client policy. This reduces inconsistent heuristics across clients without pretending **`ts`** is a global total order.
* **Not required:** a server **MUST NOT** be assumed to NTP-synchronize the world; only **local** policy and **§19.4** skew checks apply to HTTP; log times remain **advisory** for ordering when forks exist.

#### 10.4 Log consensus model (v1.2, normative)

Relay defines **no** global **consensus** mechanism for logs.

* Log **chains** are **per-actor** **append-only** histories.
* **Divergent** **valid** log branches (forks) **MUST** be **preserved**; no protocol node **MUST** **delete** a branch solely because another branch exists.
* The **protocol** **MUST NOT** require or **enforce** a **single** “canonical” chain selection for the world—**resolution** is by **origin** authority, **recovery-key** supersession where identity rules apply (**§5.4**), and **client** or **indexer** **policy**.

See also **§5.3** (fork behavior).

### 11. State object schema

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

`created_at`, `updated_at`, and other instants on state objects **MUST** be **RFC 3339** **strings** (**§4.1.1.1**), not Unix epoch integers.

### 12. Label schema

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

### 13. Channel schema

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

#### 13.1 Membership, posting mode, and verification (v1.2, known gap)

`policy.posting` may be `open|members|approved`, and membership changes appear as `log` events (e.g. `membership.add` / `membership.remove`). v1.2 does **not** define a **complete cryptographic proof** path from “actor A published post P into channel C at time T” to “A held membership in C at T” in the general federated case.

* **Reality in v1.2:** an **origin** (or a gateway acting on its behalf) is expected to **enforce** channel policy at accept time, using the **replica of the log and state** it trusts. A relay that is not the origin **MUST NOT** be assumed to have performed that proof unless it explicitly implements the same policy engine.
* **Interoperability gap:** **Portable membership** (normative, replayable **membership witness**—e.g. a Merkle path over membership events, or a signed attestation from the channel owner) is **deferred to the next specification revision** (see **Deferred to the next specification revision** in document status); v1.2 does **not** define it. An **extension** **MAY** prototype witness formats without being core-normative. Until a normative witness exists, `members` / `approved` channels **MUST** be understood as **server-enforced** (and auditably logged where the origin is honest), not as a portable proof any independent verifier can recompute from public logs alone without agreed extra data.
* **Architectural impact (v1.2):** this is the **largest remaining security / portability gap** in the core: **fast relays** and **third-party mirrors** **cannot** independently **cryptographically** verify that a poster was a member at post time; **“members-only”** semantics **reduce to trusting the channel origin** (or an indexer that replicates its policy). That is **honest** for v1.2 but **not** equivalent to globally verifiable access control.
* **What honest implementations do:** they **MUST** record membership-affecting events on the log; they **SHOULD** reject **locally** posts that fail policy when the implementation has enough state. **Operator transparency (non-behavioral):** deployers **SHOULD** state in their **user-facing or operator** material that cross-origin “member-only” semantics without a shared trusted indexer **amount to trusting the channel’s origin** (this is a **clarity** obligation for honest products, not a testable wire rule).

#### 13.2 Channel authority vs actor post authority (v1.2, normative)

* **Post authorship** is a property of the **author’s** state object; only the **author** (or the origin on their behalf) **MUST** be treated as able to **edit** the canonical post **payload** in that `object_id`’s state.
* A **channel** (owner, moderators) **MUST NOT** **mutate** the author’s **post state object** in place. Channel-level actions (pin, hide in channel, “staff picks,” local titles, order) **MUST** be represented by **separate** objects or references, for example:
  * a **label** (issuer = channel or moderator actor; **target** = post) with a `label` in an agreed enum (**§12**);
  * a **channel** state or **log** event that only records **pointers** / **curation** metadata (`channel_refs`, `channel.accept` / curation `log` event with `data` per registry);
  * optional **`ext_payload`** on channel state for `relay.ext.channel_pins.v1` etc.
* A channel **MAY** “annotate” a post in its UI by **composing** author state + **labels** + **channel** metadata; it **MUST** keep the **author** object immutable unless the **author** has authorized a co-authored edit in a **documented** way (out of band to v1.2 or via an extension).
* **Channel authority (clarification):** channels **MUST NOT** **mutate** **actor-owned** state objects. Channels **MAY** **attach** **labels**, **create** **references**, and **publish** **channel-scoped** **metadata**; all such material **MUST** remain **externally** **attached** and **separable** from the **original** **author** state (no in-place edit of the author’s canonical `payload` as stored under that `object_id`).
* This avoids ambiguous merge of “who owns the post body” when channel mods and author disagree.

#### 13.3 Channel equivalence / alias (v1.2, normative)

Channels **MAY** declare **equivalence** relationships with other channels. Equivalence is an **asserted** link object; it is **not** a substitute for **origin** authority over each channel’s id.

**Schema:**

```json
{
  "id": "relay:channel-alias:hash",
  "issuer": "relay:actor:abc",
  "source_channel": "relay:channel:abc",
  "target_channel": "relay:channel:def",
  "relation": "same_as|successor_of|mirror_of",
  "ts": "2026-04-21T00:00:00Z",
  "sig": "…"
}
```

**Issuance and authority (v1.2, normative):** The **`sig`** **MUST** **verify** under **`issuer`’s** key (**§7**). The **core** spec does **not** **require** that **`issuer`** be the **`owner`** of **`source_channel`**, **`target_channel`**, or **both**; **any** **actor** **may** **publish** a **signed** **alias** on **paths** their **software** and **peers** **accept**. **Equivalents** from an **`issuer`** that **does** **not** **control** (as **`owner`**, or a **documented** **delegate** on the **channel** object) **either** **referenced** **channel** are **self-asserted** and **MUST** **not** be **treated** as **authoritative** for **merging** **state** or **rebinding** **authority** without **local** **policy** or **out-of-band** **trust** in **`issuer`**. **Origins** **MAY** **refuse** to **index**, **replicate**, or **prioritize** **alias** objects that **do** **not** satisfy **operator**-defined **issuer** **rules** (e.g. require **`issuer`** to **control** at least one **side** of the **relation**).

**Client weighting (v1.2, non-normative; strongly recommended):** **Clients** **SHOULD** **weight** **equivalence** **claims** by **whether** **`issuer`** **controls** **one** or **both** of the **referenced** **channels** (e.g. **matches** **`owner`** on **channel** **state** the **client** **trusts**), to **mitigate** **equivalence** **spam**; **unrelated-issuer** **links** **SHOULD** **not** receive the **same** **default** **prominence** in **UI** or **merge** **suggestions** as **owner-** or **delegate-** **issued** **links** **unless** a **trusted** **attestation** or **policy** **says** **otherwise** (see **§6**).

**Semantics of `relation`:**

* **`same_as`:** the two channels represent the **same** conceptual **space** (from the issuer’s claim).
* **`successor_of`:** the **target** **replaces** the **source** in role or lineage (per issuer).
* **`mirror_of`:** the **target** **replicates** **source** content (per issuer).

**Client behavior:** clients **MAY** **group** equivalent channels in **UI** and **suggest** merged **views**. Clients **MUST** **not** **automatically** **merge** **channel** **state** or **assume** **authority** **transfer** from an alias alone.

**Indexers** **SHOULD** **expose** equivalence relationships via **API** when they index channel metadata, so clients can build on **issuer**-signed links.

### 14. Classification decision rules

Deterministic rule set:

1. If the object changes authority, membership, keys, moderation, recovery, or audit trail, it MUST be a `log` object.
2. If the object is primarily rendered as the current user-facing version, it MUST be a `state` object.
3. If both current renderability and durable audit history matter, it MUST be `dual` and emit a `state.commit` log event for every accepted state mutation.
4. Reply structure is stored on the post state object (`reply_to`) while reply arrival events may be indexed from state commits.
5. Channel membership actions are `log`; current channel profile/config is `state`.
6. Edit history is never implicit. If a client wants user-visible history, the object MUST be `dual`.

### 15. Unified semantics matrix

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

### 16. Publication APIs

#### 16.1 Publish state object

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

#### 16.2 Soft-delete state object

`DELETE /actors/{actor_id}/state/{object_id}`

Effect:

* server marks state object `deleted=true`
* increments version
* emits `state.delete` log event for `dual` objects
* for `revocable`, also marks current key grants revoked

#### 16.3 Append log event

`POST /actors/{actor_id}/log`

Body: log envelope

Validation:

* `prev` MUST match current head unless explicit fork mode is enabled
* `type` MUST be permitted for actor role
* for `follow.add` and `follow.remove`, **`target` MUST** be set as in **§10.2.1**

Response:

```json
{
  "ok": true,
  "event_id": "relay:event:hash",
  "head": "relay:event:hash"
}
```

### 17. Fetch APIs

#### 17.1 Identity

* `GET /actors/{actor_id}/identity`

#### 17.2 Actor log head

* `GET /actors/{actor_id}/log/head`

Response:

```json
{"head": "relay:event:hash", "count": 2412}
```

#### 17.3 Log event by ID

* `GET /actors/{actor_id}/log/events/{event_id}`

#### 17.4 Log range

* `GET /actors/{actor_id}/log?after=<event_id>&limit=100`
* `GET /actors/{actor_id}/log?before=<event_id>&limit=100`

#### 17.5 State object

* `GET /actors/{actor_id}/state/{object_id}`

#### 17.6 State feed snapshot

* `GET /actors/{actor_id}/state?type=post&after_ts=...&limit=50`

**Snapshot consistency (v1.2, normative):** a response that is labeled or advertised as a **snapshot** (this feed, `GET /actors/{actor_id}/snapshots/latest`, or static **Part II §29** material) **MUST** represent a **self-consistent** view of **all** **included** objects as of a **single** **logical** **commit** **boundary** on the **origin**. A snapshot **MUST** **not** **mix** object **versions** from **different** logical **states**. A snapshot **MAY** be **partial** (not every object in the actor’s history); if **partial**, the response **MUST** include **metadata** indicating **partial** **coverage** so clients do not mistake the slice for a full dump. A response **MUST** **not** be labeled a **snapshot** if it would **contain** **inconsistent** state (mixed generations) for the objects it returns.

**Canonical snapshot metadata (v1.2):** implementations **SHOULD** expose the equivalent information using **these exact key names** (in the **snapshot** JSON document **alongside** object payloads, or in a **`snapshot_meta`** object at the top level of the response—**MUST** be documented per deployment if nested):

```json
{
  "snapshot_id": "<string, origin-defined stable identifier for this snapshot>",
  "as_of_ts": "<RFC 3339 instant, §4.1.1.1>",
  "partial": true
}
```

For a **full** snapshot, **`partial`** **SHOULD** be **`false`** (or omitted with **`snapshot_id`** + **`as_of_ts`** still present). Additional keys **MAY** be added under **`ext`** / documented extensions. Clients **SHOULD** accept **documented** synonyms only as a **legacy** path; new implementations **SHOULD** emit the canonical keys above to avoid per-server schema forks.

**Clients** **MAY** **assume** that **all** objects **within** a **valid** **snapshot** are **mutually** **consistent** for rendering and sync (**§2.5** baseline includes snapshot fetch for this reason). For **paged** or **incomplete** feeds **without** snapshot metadata, treat as ordinary **query** results, not a normative **snapshot** (**§2** profiles).

#### 17.7 Channel view

* `GET /channels/{channel_id}`
* `GET /channels/{channel_id}/feed?cursor=...&limit=50`

#### 17.8 Label view

* `GET /labels?target=<id>&scope=<scope>`

#### 17.9 Indexer transparency (optional but recommended when an Indexer role is offered)

Indexers influence **discovery** and ranking; clients **SHOULD** be able to fetch **machine-readable** inputs to that behavior (not only HTML). If a deployment exposes **Indexer** APIs, it **SHOULD** implement at least:

* `GET /indexer/policy` — JSON document describing **ranking / safety** policy (what is boosted, filtered, or down-ranked, in a machine-readable form). Example minimum shape:

```json
{
  "version": 1,
  "description": "human summary",
  "boost": ["follow_graph", "recency"],
  "downrank": ["low_trust_attestation", "reported_spam"],
  "fees": {"query_credits": 0}
}
```

* `GET /indexer/sources` — JSON list of **data sources** and **crawl** or **ingest** scope (e.g. which actor feeds, how often, whether third-party mirrors are used). Example:

```json
{
  "version": 1,
  "sources": [
    {"type": "actor_feed", "actor_id": "relay:actor:…", "last_indexed": "2026-04-21T00:00:00Z"}
  ]
}
```

These endpoints are **advisory** for transparency; they do **not** create a **global** ranking—clients **MUST** still treat Indexers as one input (**§1**, **§23.2**).

### 18. WebSocket relay protocol

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

#### 18.1 HELLO

Client introduces itself.

```json
{
  "op": "HELLO",
  "req_id": "1",
  "body": {
    "client": "relay-web/0.1",
    "actor": "relay:actor:abc",
    "ws_endpoint": "wss://live.example/ws",
    "auth": {
      "nonce": "server-issued nonce (required when signing)",
      "ts": "2026-04-21T12:00:00Z",
      "sig": {
        "alg": "ed25519",
        "key_id": "key:active:1",
        "value": "base64..."
      }
    },
    "supports": ["state_push", "label_push", "channel_subscriptions"]
  }
}
```

**Unsigned `HELLO`:** `auth` **MAY** be omitted, or **`auth.sig`** omitted, for anonymous subscribe-only sessions as allowed by deployment policy.

#### 18.1.1 HELLO `auth` signature (v1.2, normative)

When **`auth.sig`** is present, the relay **MUST** verify an **Ed25519** signature (**§7.1**) over a **deterministic UTF-8 message** so that **independent implementations** agree on **what** is signed.

* **`auth.nonce`:** **MUST** be present and **non-empty**; **MUST** be the **server-issued** nonce for this connection attempt (or for this `HELLO` exchange if the server documents a challenge round-trip). The relay **MUST** enforce **replay** protection on **`nonce`** per **§18.4.4**.
* **`auth.ts`:** **MUST** be present; **MUST** be an **RFC 3339** instant (**§4.1.1.1**). The relay **MUST** enforce freshness per **§18.4.4** (align **±5 minutes** with server time unless documented otherwise).
* **`body.ws_endpoint`:** **MUST** be present when **`auth.sig`** is present; **MUST** be the **exact** WebSocket URL string the client used to open this connection (**scheme**, **host**, **port** if non-default, **path**; no trailing slash added unless actually used). This **binds** the signature to the relay endpoint and reduces cross-endpoint replay of captured `HELLO`s.
* **`sig`:** **MUST** use the same **`alg` / `key_id` / `value`** shape as envelope signatures (**§7**); **`key_id`** **MUST** resolve to an **active** key on **`body.actor`**’s identity document.

**Signature input (UTF-8 bytes, NFC on each line’s logical content per §4.1.2):** concatenate the following **five** lines, each terminated by a **single** **LF** (`0x0A`), **including** a final LF after the last line:

1. The **literal** domain-separator line: `relay.v1.2.ws_hello_auth`
2. **`body.actor`** (exact string)
3. **`auth.nonce`** (exact string)
4. **`auth.ts`** (exact string)
5. **`body.ws_endpoint`** (exact string)

The **Ed25519** signature **MUST** be computed over **those UTF-8 bytes** with no BOM. **Verifiers** **MUST** reject **`HELLO`** messages whose **`auth.sig`** does not verify against the message above.

#### 18.2 SUB

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

#### 18.3 PUB

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

**Normative** **security** and **enforcement** for `PUB` and sessions: **§18.4**.

#### 18.4 WebSocket security (v1.2, normative)

**18.4.1 Signed payloads**

`PUB` messages whose **`body.envelope`** carries **actor-authored** **signed** **objects** (**state** | **log** | **label** per **§7**) **MUST** include a **fully** **valid** **signed** **envelope** (signature verifies under the **actor**’s **current** key material per **identity** + **log** rules).

Relays **MUST**:

* **verify** **signatures** before **accepting** or **forwarding** a `PUB` payload
* **reject** **unsigned** or **invalid** objects

**18.4.2 Session binding**

If **`HELLO`** **authenticates** an **actor** (e.g. `body.actor` with **`auth.sig`** verifying per **§18.1.1**, or equivalent **documented** profile):

* the **WebSocket** **session** **MUST** be **bound** to that **actor**
* subsequent **actor-scoped** **operations** (e.g. `PUB` as that actor) **MUST** **match** the **authenticated** **actor**; **mismatch** **MUST** be **rejected**

**18.4.3 Session lifetime**

Relays **SHOULD** **enforce** **session** **expiration** (recommended: **≤ 1 hour** of inactivity or wall-clock, deployment-defined) and **require** **re-authentication** (new `HELLO` or new HTTP-secured token exchange) after expiration.

**18.4.4 Replay protection**

Relays **MUST**:

* **reject** **duplicate** **nonces** (or **equivalent** **anti-replay** **tokens**) **within** the implementation’s **replay** **window**
* **enforce** **timestamp** / **request** **freshness** within **±5** **minutes** of server time **unless** a **different** **bound** is **explicitly** **configured** and **documented** (align intent with **§19.4** for HTTP; WebSocket may use the same or a stricter local policy)

**18.4.5 Authorization**

Relays **MUST** **not** **accept**:

* **unsigned** **mutation**-class requests (no valid signature on the object to be propagated when signatures are required)
* **actor-scoped** **actions** **without** **valid** **authentication** when the op is not anonymous

#### 18.5 EVENT / STATE / LABEL

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

### 19. Auth model

#### 19.1 Standard (v1.2, normative)

Relay v1.2 **MUST** use **[RFC 9421](https://www.rfc-editor.org/rfc/rfc9421) (HTTP Message Signatures)** for authenticated HTTP requests to origin APIs, including publication and other actor-bound mutations, unless a deployment is using a **deprecated** profile (§19.3) only for backward compatibility.

**Minimum signed components** (in addition to whatever the implementation needs for replay protection):

* **request target** (method and path; per RFC 9421)
* HTTP **Date** (or an agreed `created` / `expires` parameter in the signature as allowed by RFC 9421)
* **Content-Digest** (or equivalent body digest) over the **exact** request body bytes

The server **MUST** verify the digest and that the signature verifies under a key that is **bound** to the calling **actor** (§19.2).

#### 19.2 Actor binding

The HTTP message signature **MUST** map to an **actor identity** and an **active** (or permitted) key in that actor’s **identity document** at the time of verification. Implementations **SHOULD** reject requests where the key is not listed or is revoked.

#### 19.3 Legacy support (optional, deprecated)

Custom header auth as used in many v1.1 drafts **MAY** still be supported for transition (e.g. `X-Relay-Actor`, `X-Relay-Timestamp`, `X-Relay-Nonce`, `X-Relay-Signature`). It is **deprecated**; new implementations **SHOULD** implement RFC 9421 only.

For publication and actor-bound mutation without message signatures, servers **MAY** additionally accept:

* OAuth-style bearer token bound to actor identity
* session token from authenticated origin

when local policy allows; this is **not** a normative alternative to §19.1 for “Relay v1.2 interop” unless explicitly negotiated out of band.

#### 19.4 Replay and freshness (v1.2, normative)

**HTTP (RFC 9421)** and/or request metadata **MUST** bound how long a signed request (or its contained signature base) is valid, or replays and delayed replays can be abused.

* **Clock skew:** the server’s clock and the time claims in the request **MUST** agree within **±5 minutes (300 seconds)** for `Date` / `@date` and any `created` / `expires` (or equivalent) field used in the signature. The server **MUST** reject the request as **stale** or **invalid** if those times fall **outside** that skew window relative to the server’s current time, unless a deployment has a **documented** larger skew policy (not recommended for public interop).
* **Request freshness:** at least one of the following **MUST** be present and verified (exact header names can follow RFC 9421 and deployment profile):
  * a **`Signature` (or related) `created` / `expires` parameter** or **`@date`** such that the signature’s validity window is **bounded** and checked; **or**
  * a **nonce** (or one-time `request_id` bound to a server-issued **challenge** storage) in the **signed** components, **MUST** be **unique** per **actor** (and key id, if used) **within a rolling time window of at least 5 minutes** (server-defined retention, **MUST** be long enough to detect duplicates); **or**
  * a **combination** of `Date` + `Content-Digest` + a **short-lived** server-issued session id in the signed path (still subject to the skew rule above).
* The server **MUST** reject requests whose signature is **expired** (`expires` in the past, or equivalent) or whose nonce **reuses** a value already seen in the same actor+window.
* **WebSocket** `HELLO` / `PUB` and similar are **MUST** use the same skew and replay limits **if** they carry request-like signing; otherwise they rely on the secure transport + session rules in **§18** and deployment policy (still **SHOULD** use bounded tokens).

Clients **MUST** send a fresh **`Date`** header on signed HTTP requests; servers **MUST** validate it against **§19.4** in addition to **§19.1** verification.

### 20. Revocable and ephemeral APIs

#### 20.1 Key grant retrieval

`GET /actors/{actor_id}/keys/{key_id}`

Returns wrapped content-key grants for authorized clients.

#### 20.2 Key revoke

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

#### 20.3 Revocable content (clarified)

* **Guarantees:** revocation **prevents future authorized reads** of protected material at honest origins/relays.
* **Does not guarantee:** deletion from all **mirrors**, all **recipients** who already copied data, or **compromised** or malicious **clients**.

#### 20.4 Ephemeral content (clarified)

* **Provides:** time-bounded availability and **best-effort purge** by **compliant** clients and servers; metadata MAY carry expiry and TTL.
* **Does not provide:** cryptographic erasure, screenshot protection, or enforceable “no retention” against malicious peers.

**Client requirements (ephemeral and expired content):**

* **MUST** purge local **plaintext** after expiry (best-effort where the OS allows)
* **MUST NOT** render or treat as current objects past their effective expiry
* **MUST** surface expiration metadata where relevant (e.g. “expired at …”)
* **MUST NOT** imply **guaranteed** deletion, memory wiping, or peer behavior

**UX (compose time):** for ephemeral posts, the composer **MUST** show a short warning such as: **“Ephemeral content may still be captured by recipients.”**

### 21. Error model

All APIs return structured errors.

```json
{
  "ok": false,
  "error": {
    "code": "invalid_signature|conflict_version|conflict_detected|unknown_actor|forbidden|unsupported_extension|schema_error|fork_detected",
    "message": "human-readable detail"
  }
}
```

Error objects **MAY** add fields such as `object_id` and `expected_version` (integer) for machine-readable repair (see `conflict_detected` below).

**`conflict_detected` (v1.2, required new code):** returned when the server has detected a state **version** conflict. Example:

```json
{
  "ok": false,
  "error": {
    "code": "conflict_detected",
    "message": "State version conflict detected",
    "object_id": "post:01J…",
    "expected_version": 4
  }
}
```

### 22. Extension model

#### 22.1 Registry and naming

Core extension identifiers use the **namespace**:

* `relay.ext.<name>.v<version>`

The **MVP** log-event **`data`** payload shapes for the most common `type` values are **normative in Appendix B** of this document. **Other** `type` values use **deferred** `data` schemas and **SHOULD** be named and versioned the same way (or in a companion “log event data” spec) so that `trust.attest`, `membership.add`, etc. are not **silently** incompatible—see **§10.2**.

**Extension registry (companion, v1.2):** This repository’s **`registry/`** directory is the **MVP** **public** **registry** for log-event `data` definitions and (optionally) **`relay.ext.*`** object extensions. Each entry is one **JSON** (or **Markdown**) file; see **`registry/README.md`**, **`registry/CONTRIBUTING.md`**, and the **seed** entries (e.g. `trust.attest`, `membership.add`, `state.revoke`) there. The registry **supplements** this spec; it does **not** **override** **Appendix B** for the five **MVP** **normative** `type` + `data` rows.

**Broader registry coverage**—making **additional** log-event **`data`** types **first-class normative interop** in the **core** spec (beyond **Appendix B** and companion **`registry/`** drafts)—is **deferred to the next specification revision**; see **Deferred to the next specification revision** in document status.

#### 22.2 Extension object requirements

Each published extension (when used in `ext` / `ext_payload`) **MUST** define, in human-readable specification form:

* **schema** and field semantics
* **validation** rules
* **compatibility** behavior (ignore vs reject unknown fields) for forward/backward version pairs

#### 22.3 Core fields

Objects MAY include:

* `ext`: array of extension identifiers
* `ext_payload`: namespaced extension data
* `ext_required` (optional boolean, default **false**): if **true**, a **consumer** that does not implement **all** listed `ext` ids **MUST NOT** treat the object as a **complete** or **canonical** rendering of that type (see **§22.5**).

Example:

```json
{
  "type": "post",
  "ext": ["relay.ext.richtext.v1"],
  "ext_required": false,
  "ext_payload": {
    "relay.ext.richtext.v1": {"format": "markdown"}
  }
}
```

#### 22.4 Client behavior (optional extensions)

If **`ext_required` is absent or false** and an extension is **unsupported** on the client, the client **MUST** ignore unknown `ext_payload` fields **safely** (no corrupt round-trips), **MUST NOT** mutate the object in a way that would invalidate signatures or state, and **SHOULD** render a **fallback** (metadata-only) view when possible.

#### 22.5 Required extensions and version negotiation (v1.2, normative)

If **`ext_required` is true**:

* the object **MUST** list in **`ext`** every extension that is **required** for a faithful representation;
* a client that **lacks** one or more of those extensions **MUST** treat the object as **partially renderable** only: it **MUST NOT** show it as the same **UI class** as a fully supported post (e.g. must not use the normal “post card” with full metrics if layout depends on a missing ext), **MUST** show **unsupported** / **incomplete** affordance, and **MUST** still **preserve** `ext` / `ext_payload` on round-trip if it edits other fields;
* **safety (additional, v1.2):** clients **MUST** **not** perform **operations** that **assume** full **semantic** **understanding** of the object (e.g. merges, “smart” edits, ranking) as if the **missing** extensions were **absent** in meaning. Clients **MUST** **not** **modify** or **reserialize** the object in ways that could **corrupt** **extension**-controlled **meaning** (preserve raw signed **material**; follow **round-trip** rules in **§22.4**);
* **Clients** **SHOULD** use **fallback** **rendering** and a clear **indicator** that an **extension** is **required** but **unsupported**;
* **version negotiation** is by **`ext` id** including a **version suffix** (`relay.ext.name.v1` vs `v2`). A client that speaks only `v1` and receives `v2` **MUST** treat that extension as **unsupported** and apply the same **§22.4** / **§22.5** rules for optional vs **ext_required** as appropriate.

**Ignore-unknown** (§22.4) **does not** mean “pretend a required extension is present”; it means **no silent corruption** of unknown bytes.

#### 22.6 Relay policy JSON (client handling)

The same **ignore-unknown** and **round-trip** discipline applies to **top-level** JSON from **§32.1** (`GET /relay/policy` or equivalent): **MUST** ignore unknown policy keys for automation; **MUST NOT** base security or rate-limit bypass decisions solely on unauthenticated policy text; **SHOULD** treat a failed or missing policy document as “unknown” and use conservative local defaults.

### 23. Security considerations (v1.2, normative)

#### 23.1 Threat model summary (what Relay defends)

* **host loss** → mirrors and multi-origin hints improve availability of public artifacts
* **replay** → mitigated by signatures, **§19.4** freshness (skew, nonce / expires), and state **version** discipline
* **impersonation** → mitigated by identity keys, rotation, and recovery rules
* **spam amplification** → mitigated by relay and origin **policy** (rate limits, accept lists), not by protocol magic

#### 23.2 Non-goals and residual risks (honesty requirements)

* Relay does **not** guarantee **deletion** after a recipient (or a compromised client) has learned plaintext
* Relay does **not** promise **global** censorship-resistance; availability is operator- and network-dependent
* Relay does **not** guarantee **global identity uniqueness** (handles are not a substitute for out-of-band binding)
* **Malicious** or non-conforming **clients** may retain, forward, or mis-display data; the protocol can only make honest behavior unambiguous
* **Dominant indexers** can skew discovery; clients **SHOULD** diversify sources
* **Trust signals** can still social-centralize if users converge on a few issuers; this spec only requires verifiable attestation, not a fixed hierarchy
* **`channel_id` is not globally unique in v1.2 (known gap, MVP-acceptable):** because **canonical channel genesis** / **global channel identity** are **deferred to the next specification revision** (**§4.3**, **Deferred to the next specification revision** in document status), two different origins can assign **different** `channel_id` values to the **same** logical “channel” in the human sense, and the protocol has **no** built-in way to **detect** or **merge** them. Interop assumes an **opaque** id **published by the origin** you are talking to, not a recomputed **global** id. An **extension** **MAY** define experimental genesis rules; **core** normative global identity waits for the next revision. Until then, duplicate logical channels are a **product-level tradeoff**, not merely a footnote: **discovery fragments** across origins, users **cannot** rely on a single global channel key, and **aliases** (**§13.3**) plus **indexers** become **load-bearing** for “same channel everywhere” UX. None of that is a **signature** failure—but it **is** a **real interoperability and UX cost** honest clients should plan for.

---

## Part II — Reference Server + Relay Implementation (non-normative reference)

### 24. Deployment topology

Reference implementation is split into three services plus optional extras:

1. **Origin API**

   * authoritative identity + state + log write path
2. **Static Feed Host**

   * serves immutable log chunks and state snapshots
3. **Fast Relay Service**

   * WebSocket fan-out and short-lived caches
4. **Optional Indexer**

   * search, channel aggregation, and discovery views; expose **§17.9** (`GET /indexer/policy`, `GET /indexer/sources`) when offering an Indexer so clients can inspect **ranking inputs**

A small install may run Origin API + Static Feed Host + Fast Relay in one process.

### 25. Recommended stack

Reference choices:

* language: TypeScript/Node for fastest ecosystem reach, or Go for simpler deployment and lower memory
* durable database: PostgreSQL
* blob/object storage: S3-compatible bucket or local object store
* cache/pubsub: Redis or NATS
* WebSocket: native ws server or NATS-backed gateway

### 26. Core modules

#### 26.1 Identity module

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

#### 26.2 State module

Responsibilities:

* validate state object writes
* maintain latest state per object
* maintain version history if enabled
* emit commit hooks

Tables:

* state_objects_latest
* state_versions (optional but recommended)
* object_tombstones

#### 26.3 Log module

Responsibilities:

* append validated events
* maintain head pointer per actor
* expose pagination and range queries
* detect forks/conflicts

Tables:

* log_events
* actor_log_heads
* log_forks

#### 26.4 Channel module

Responsibilities:

* channel state
* membership actions
* acceptance/removal refs
* policy resolution

Tables:

* channels
* channel_membership_events
* channel_content_refs

#### 26.5 Label module

Responsibilities:

* store and query labels
* scope filtering
* issuer authenticity

Tables:

* labels
* label_targets

#### 26.6 Relay module

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

### 27. Publication flow

#### 27.1 State publish flow

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

#### 27.2 Log append flow

1. authenticate request
2. canonicalize + verify signature
3. validate `prev`
4. append row
5. update head pointer
6. write immutable chunk or append segment file
7. notify Fast Relay

### 28. Feed hosting layout

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

### 29. Snapshot strategy

To reduce polling cost:

* generate actor state snapshots every N writes or T minutes
* include object IDs, versions, updated timestamps, and hashes
* **Consistency (align Part I, §17.6, normative):** a **published** **snapshot** (file or `GET /actors/{actor_id}/snapshots/latest`) **MUST** be **self-consistent** for **all** **included** objects as of a **single** **logical** **commit** **boundary** on the origin. **MUST** **not** **mix** **versions** from **different** **generations** of the same object. A snapshot **MAY** be **partial**; if so, **metadata** **MUST** make **partial** **coverage** **clear**. Implementations **SHOULD** use the **canonical** **`snapshot_id` / `as_of_ts` / `partial`** shape from **Part I §17.6**. **MUST** **not** label a response a **snapshot** if it is **inconsistent**. See **Part I §17.6** for feed pagination vs snapshot labeling.
* It remains **valid** to serve **non-snapshot** **incomplete** lists (cursors, limits) as ordinary query results, not as a normative **snapshot** unless documented as such.

Endpoint:

* `GET /actors/{actor_id}/snapshots/latest`

### 30. Relay implementation behavior

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

### 31. Relay replay window

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

### 32. Rate limiting and abuse control

Reference server policies:

* per-IP and per-actor publish rate limits
* per-relay session subscription limits
* per-channel submission throttles
* optional relay write fees or membership policies

Policy surfaces **MUST** be inspectable by clients. When an implementation exposes a policy URL (e.g. `GET /relay/policy`), the response **SHOULD** be **machine-readable** JSON as in **§32.1** so clients are not required to scrape HTML. (Part II is **reference**; a production profile built on v1.2 may **normatively** require this shape in a separate deployment spec.)

#### 32.1 Machine-readable policy response (v1.2)

Implementations that expose `GET /relay/policy` (or an equivalent) **SHOULD** return `Content-Type: application/json` and a top-level object usable by automation. Example (values are **illustrative**; servers set their own limits and fee schedules). Extra keys are **allowed**; **client** handling is **Part I, §22.4**.

```json
{
  "version": 1,
  "max_publishes_per_minute_per_actor": 120,
  "max_publishes_per_minute_per_ip": 600,
  "max_websocket_subscriptions_per_connection": 200,
  "max_channel_submissions_per_minute": 30,
  "default_trust_floor": ["cryptographic_only"],
  "write_cost_credits": 0,
  "credits_per_actor_per_day": null,
  "notes": "Human-readable; do not use as machine control surface."
}
```

* **`version`:** non-negative integer; **SHOULD** be present in new deployments so clients can branch on future formats.
* **Rate and cost fields** (`max_publishes_per_minute_per_actor`, `write_cost_credits`, etc.): if present, values are a non-negative number or `null` where `null` means “no cap / not applicable (per server’s docs).”
* **`default_trust_floor`:** optional array of strings, same intent as `policy.trust_floor` on channels; clients **MAY** use for UI defaults.
* **Client requirements:** see **Part I, §22.4** (this Part II example is not normative in isolation).

### 33. Consistency model

#### 33.1 State

* the **origin** is authoritative
* the **last** valid, accepted version is current (subject to conflict repair per §5)
* equal `version` with different payload is a **conflict**; clients and mirrors **MUST** follow §5

#### 33.2 Log

* append-only per actor chain; **forks** are a normal possibility
* forks **MUST NOT** be **silently collapsed**; at least one honest implementation strategy is to preserve divergent heads for inspection
* **identity** supersession (recovery, rotation) is governed by the identity and key rules; the log may show multiple valid-looking histories that clients reconcile per §5.4

#### 33.3 Fork causes (v1.2)

Common causes: **network partition**, **concurrent writes** from multiple devices, **malicious** actors, **mirror** inconsistency, or **replay** from stale caches. None of these justify silent collapse of a fork without policy.

#### 33.4 Client strategy (non-normative; aligns with Part III)

Clients **SHOULD**: detect divergence, attempt **origin** reconciliation, mark fork or conflict state in UI, and when choosing a chain prefer (in order, when applicable): **valid signatures**, a **consistent** chain, and **recovery-key** or equivalent authority (§5.4) over stale branches.

### 34. Recovery workflows

#### 34.1 Guardian recovery

1. actor requests recovery challenge
2. origin publishes pending recovery object
3. guardians submit signatures
4. waiting period begins
5. original key may veto during delay
6. if not vetoed and threshold met, new active key becomes valid
7. origin emits `key.rotate` and identity update

### 35. Optional P2P support

Reference implementation MAY add a fetch/mirror daemon:

* announces available actor feed chunks
* serves cached immutable log chunks and public state snapshots
* never becomes sole required path

This allows pure P2P survival mode without making it the primary UX path.

---

## Part III — Client Architecture (non-normative reference)

### 36. Client goals

A Relay client should:

* own keys safely
* render current state consistently
* preserve local moderation control
* sync reliably over flaky networks
* degrade gracefully from live relay to HTTP polling

### 37. Client layers

#### 37.1 Identity & key manager

* actor keys
* recovery config viewer
* device session keys
* optional secure enclave / OS keychain integration

#### 37.2 Local store

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

#### 37.3 Sync engine

Responsibilities:

* bootstrap identity
* fetch snapshots
* subscribe to Fast Relay
* reconcile state updates
* detect divergence, **mark fork/conflict** state, and refetch or reconcile with **origin** (see **§5**, **§10.4**; **Part II §33**)

#### 37.4 Policy engine

Responsibilities:

* apply local moderation rules
* merge labels from selected sources
* apply channel policy and trust floors
* compute final visibility state

#### 37.5 Composer/publisher

Responsibilities:

* build canonical objects
* sign locally
* publish to origin
* optionally push to relay for fast fan-out

### 38. Client sync flow

#### 38.1 Bootstrap

1. resolve identity doc
2. fetch actor snapshot(s)
3. fetch log head(s) if needed
4. populate local store
5. connect to one or more relays from origin hints or user config
6. subscribe to followed actors/channels

#### 38.2 Live sync

When relay sends update:

1. verify envelope signature
2. if state object version is newer than local, apply
3. if version skips beyond one and object is important, schedule origin fetch
4. update UI from local store
5. store cursor for replay

#### 38.3 Reconnect flow

1. reconnect to previous relay(s)
2. request replay from last cursor
3. if replay gap, fetch HTTP snapshot from origin
4. reconcile

### 39. Timeline architecture

The client timeline is a projection, not a protocol object.

Pipeline:

1. collect followed actor posts + channel accepted refs
2. filter through policy engine
3. sort according to selected timeline strategy
4. render from local state cache

The protocol does not mandate ranking.

### 40. Channel integration

Client keeps separate concepts for:

* authorship (post owner)
* inclusion (channels referencing or accepting a post)
* moderation (labels and channel removal actions)

A post removed from a channel is not erased from the actor profile unless locally filtered.

### 41. Edit/delete UX semantics

The client MUST present different semantics by content class:

* `durable_public`: “Public and durable; deletion is suppressive only.”
* `mutable_public`: “Public; latest version is authoritative.”
* `revocable`: “Future access can be revoked for authorized viewers.”
* `ephemeral`: “Time-bounded visibility only; recipients may still retain copies.”

For `ephemeral` (and, where applicable, other time-limited content), the compose surface **MUST** also make clear that **ephemeral content may still be captured by recipients** (screenshots, other clients, etc.). Warnings for audience and retention class should be **visible at compose time**, not only after send.

### 42. Offline mode

Client MUST support:

* local draft composition
* delayed publish queue
* cached reading of synced state/logs
* eventual resend when origin/relay available

If pure P2P add-on exists, client MAY fetch public cached chunks from peers.

### 43. Multi-account architecture

Recommended model:

* one workspace
* multiple actor identities
* per-identity key storage
* per-identity relay/origin preferences
* shared but partitioned local cache

### 44. Security architecture

Client SHOULD:

* store private keys in OS keychain/secure enclave where possible
* never send raw private keys to origin or relay
* sign locally
* verify every incoming signature before durable local commit
* isolate extension rendering from core data model

### 45. Extension handling

Clients advertise supported extensions and **degrade** gracefully, consistent with **§22.4–§22.6**: ignore unknown `ext` fields without corrupting the signed core; never serialize edits that would invalidate foreign extensions you do not understand.

If **`ext_required`** is **true** (for meaningful rendering) and a listed extension is not supported, follow **§22.5** (do **not** present as the normal canonical post type).

If an object includes a **required** (for meaningful rendering) extension that is not supported:

* display **fallback** / **incomplete** metadata
* **MUST NOT** mutate the object in a way that breaks signatures, versions, or unknown payloads
* **MUST** preserve unknown extension payloads when re-emitting as an editor or proxy, unless the user explicitly waives that guarantee in a product-specific way (out of band to this spec)

### 46. Minimal screens / surfaces

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

### 47. First implementation recommendation

Reference client stack:

* web: React + TypeScript + IndexedDB
* desktop/mobile later via shared state engine
* transport abstraction supporting HTTP + WebSocket first

### 48. MVP cut line

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

Relay v1.2 is a **hybrid protocol stack**; Part I (wire protocol) is the interoperability core, and Parts II–III are implementation guidance.

* **Conformance** **profiles** and **`relay_profiles`** on **identity** make partial implementations and **interoperability** **claims** explicit (**§2**)
* **The `registry/` directory** in this repository holds **draft** **log-event `data`** (and future **`relay.ext.*`**) **entries** for **types** beyond **Appendix B**, so “register before interop” is **actionable** (**§22.1**)
* **HTTP** provides authoritative fetch and publication (v1.2 standardizes on **HTTP Message Signatures** for interop; see **§19**)
* **WebSocket relays** provide fast fan-out and replay windows (**§18.4** for security on `PUB` / sessions)
* **Static feed hosting** provides durability and cheap mirroring
* **Optional P2P** provides resilience, not the primary UX path
* **Clients** own **keys** and **local** policy, including attestation and extension handling
* **Deferred** work (**portable membership**, **global channel identity**, **capability split from identity**, **broader normative registry coverage**) is **listed once** under **Deferred to the next specification revision** in the document status section

The architecture is intended to be implementable, resistant to **silent** data loss in logs, and **explicit** about who is authoritative, what is conflicted, and what security properties are **not** guaranteed.

---

## Appendix B — Normative MVP seed: log event `data` (v1.2)

This appendix **instantiates** the minimum **`data`** object for the five event **`type`** values that **MVP** implementations are most likely to emit. It is **part of** this specification (not a separate registry). Two implementations that interoperate on these types **MUST** use **`data`** objects that are **compatible** with the tables below: **required** keys and JSON types **MUST** match; **additional** keys in `data` are **allowed**. Rules for the top-level **`target`** field (required vs optional, and meaning) are **normative in §10.2.1**, not only in the table notes. **§4.1.1** applies to numbers; **§4.1.1.1** does not apply inside `data` except where a field is explicitly a timestamp string.

| `type` | Required `data` shape (JSON object) | Notes |
| --- | --- | --- |
| `follow.add` | `{}` (empty object) | **§10.2.1:** `target` **MUST** = followed actor’s `actor_id`; event `actor` = follower. |
| `follow.remove` | `{}` | Same as `follow.add`. |
| `state.commit` | `{ "object_id": "<string>", "version": <integer> }` | `object_id` is the state object id (e.g. `post:…`). `version` is the **new** version after commit. |
| `state.delete` | `{ "object_id": "<string>", "version": <integer> }` | `version` is the version after tombstone/delete per **§16.2**. |
| `key.rotate` | `{ "new_key_id": "<string>" }` with optional `"previous_key_id": "<string>"` | **Keys** are identity key ids (e.g. `key:active:2`). **§10.2.1:** `target` **MAY** be omitted; if present, **SHOULD** = `actor` (the account whose **identity** is updated). **Invalidation:** after the origin applies the new identity, the **replaced** active key (identified by `previous_key_id` when present) **MUST NOT** be accepted for **new** HTTP or object signatures; the updated **`keys.active`** in the identity document is authoritative together with this event. For extra audit, implementations **MAY** add e.g. `"superseded_by_event": "relay:event:…"` in `data` (extension) but it is **not** required in the seed. |

**Not in this seed:** e.g. `trust.attest`, `membership.add`, `state.revoke`—define `data` in a **registry** file (**`registry/`** in the Relay spec repository) or a later spec revision before claiming interop for those types. See **§22.1**. **Broader normative registry coverage** (next-revision **core** interop for many event types) is **deferred**; see **Deferred to the next specification revision** in document status.

---

## Appendix A — Conformance checklist (normative scope)

**A.1 Part I wire requirements (§1–§23)** — the table below lists **MUST** / **MUST NOT** rules that apply to **Part I** **only**. Section numbers refer to **Part I** unless a row explicitly says otherwise. Wording in the main text prevails. **SHOULD** / **MAY** are mostly omitted; a few **SHOULD** rows are included where they gate interop.

**A.2 Documentary / operator items (not wire tests):** **§13.1** third bullet is **product transparency** (**SHOULD** disclose trust model in operator material), not a protocol byte test.

**A.3 Cross-part references:** **Part II §29** repeats snapshot **semantics** from **Part I §17.6** for implementers reading the reference server section; **compliance** for **snapshot** **MUST** rules is assessed against **§17.6** (Part I). **Appendix B** is **normative** for MVP log `data` for the five listed `type` values.

| Ref. | Must / must not | § |
| --- | --- | --- |
| C0 | **`relay_profiles`** on the **identity** document **MUST** be present for new v1.2 interop; values **MUST** honestly reflect **§2** support. | §2, §8 |
| C1 | Use canonical JSON for hashing and signing of protocol objects. | §4, intro |
| C1a | **Numbers:** **§4.1.1** — no `e`/`E` exponents; JSON `number` only for **integers**; fractions/precision in **strings** or fixed-scale integers per schema. | §4.1.1 |
| C1a1 | **Instants / timestamps:** `ts`, `created_at`, `*\_at` / `*\_ts` fields **MUST** be **RFC 3339 strings**; **not** Unix epoch **numbers**. | §4.1.1.1, §10.3 |
| C1b | **Strings in signed/hashed objects:** UTF-8; **MUST** NFC before digest/sign/verify; RFC 8259-consistent minimal escaping. | §4.1.2 |
| C1c | **Signature algorithms (core interop):** `ed25519` **MUST**; other algorithms only via **extension** + no silent `alg` substitution. | §7.1 |
| C2 | Use **SHA-256** for all base-protocol **content-addressed** `relay:obj:…` identifiers; **clients** must implement and accept **SHA-256** for that purpose. | §4.2 |
| C3 | Derive new **`actor_id`** as `relay:actor:` + SHA-256 **multihash** over **32-byte raw Ed25519** public key (decoded from the identity `keys.active` style material); do **not** hash PEM/JWK/wrapper encodings. | §4.3 |
| C3a | **`channel_id`:** opaque per origin; **no** global dedup of logical channels (**§23.2**). | §4.3, §23.2 |
| C4 | On state conflict, **receivers** follow origin, mark conflict, replace local, fetch origin, retain diagnostics; **mirrors** do not assert non-authoritative state as authoritative; follow **§5** for repair. | §5 |
| C5 | Do **not** **silently** collapse or merge log forks; **preserve** branches; do **not** **discard** valid signed events (except out-of-band policy). | §5.3 |
| C5a | **No** global log **consensus**; **divergent** **valid** branches **MUST** be **preserved**; the protocol **MUST** **not** **enforce** a **single** **canonical** global chain. | §10.4 |
| C6 | **Prefer** recovery-signed identity chain per **§5.4** when both appear. | §5.4 |
| C6a | **Multi-device (optional):** core remains integer `version` +1; `device_id` / clocks only in **§5.5** as optional. | §5.5 |
| C7 | Back **trust signals** in interoperable use with a **verifiable** attestation; **verifiers** apply **local** policy; treat unknown attestation `type` as **unverified**; **clients** verify attestation signature, issuer, then policy. | §6 |
| C7a | **Attestation** `expires_at` / `supersedes` / **§6.5** **trust.revoke** and supersession. | §6, §6.5, §10 |
| C8 | User-visible content declares `content_class` and `storage_class`; obey **§9** / **§10** / **§14** class rules. | §9, §10, §14 |
| C9 | If both live state and audit log are required, use **`dual`** and emit the required `state.*` log events. | §9.1 |
| C10 | **`prev`**: JSON `null` for genesis, never the string `"null"`; first chain event must use `prev: null`; accept genesis; no silent merge of forks. | §10.1 |
| C10a | **Clocks / ordering:** `ts` is not global total order; **§19.4** for HTTP; origin **MAY** use monotonic **append** order; **`prev`** is source of truth for history. | §10.3, §19.4 |
| C11 | For unknown `data`+`type` (types **not** in **Appendix B**), if storing the event, still store/forward **signed** content (best-effort). | §10.2 |
| C11b | **MVP** log `data` for `follow.add|follow.remove|state.commit|state.delete|key.rotate` **MUST** match **Appendix B** (allow extra keys). | Appendix B, §10.2 |
| C11c | **`target` on log events:** `follow.*` **MUST** populate `target` with followee `actor_id`; `key.rotate` **`target`** optional, see **§10.2.1**; old key invalidation per **§10.2.1** / identity. | §10.2.1, Appendix B |
| C11d | **Snapshots (Part I):** **MUST** be **self-consistent** at a **single** **logical** **commit** **boundary**; **MUST** **not** **mix** **generations**; if **partial**, **MUST** declare **metadata**; **MUST** **not** use the **snapshot** label for **inconsistent** responses. Non-snapshot **paged** feeds: **§17.6**. *See **A.3** for Part II echo.* | §17.6 |
| C11e | **Snapshot metadata:** if **partial** (or full) snapshot metadata is emitted, **SHOULD** use **`snapshot_id`**, **`as_of_ts`**, **`partial`** per **§17.6** canonical shape. | §17.6 |
| C12 | **Channel membership** limits are **not** a portable **crypto proof** in v1.2; do **not** assume relays enforced membership; record membership on log; see **§13.1** (operator **SHOULD** in third bullet, **A.2**). | §13.1 |
| C12a | Channels **MUST NOT** mutate author post state in place; use **labels** / **refs** / **log** per **§13.2**; **equivalence** / **alias** objects **MUST** follow **§13.3** if used. | §13.2, §13.3 |
| C13 | **RFC 9421** for authenticated origin HTTP in v1.2 interop; **server** validates digest and binds key to `actor` identity. | §19 |
| C13a | **§19.4** replay: **±5 min** skew; require **created/expires** or **nonce** uniqueness per actor+window; reject **expired** / reused nonce. | §19.4 |
| C13b | **WebSocket:** verify **PUB** **signatures**; **session** **binding**; **no** **unsigned** **mutations**; **replay** and **auth** per **§18.4** when a Fast Relay is offered. | §18, §18.4 |
| C13c | **HELLO `auth.sig` (when present):** **MUST** verify **Ed25519** over **`relay.v1.2.ws_hello_auth` + LF + `actor` + LF + `nonce` + LF + `ts` + LF + `ws_endpoint` + LF** (UTF-8, **§18.1.1**); **`nonce`**, **`ts`**, **`ws_endpoint`** **MUST** be present as required there. | §18.1.1 |
| C14 | **Ephemeral** / expiry client **MUST**s and **MUST NOT**s (render, delete claims, copy warning). | §20.3–20.4 |
| C15 | Return structured errors; support **`conflict_detected`** where version conflicts are surfaced. | §21 |
| C16 | Extensions: optional vs **ext_required** (**§22.5**); **§22.4** ignore-unknown for optional; **§22.6** relay policy JSON. | §22.4–§22.6 |
| C16a | **Indexer (optional):** if offered, use **§17.9** transparency endpoints. | §17.9, §1 |

*Optional:* extend this table with your own test vectors for **§4.1** canonicalization, **§4.1.1.1** timestamps, **Appendix B** `data` objects, and **§4.3** `actor_id` bytes; those sections use normative “must” language in narrative form as well as the table.

**Not Part I (reference only, but has MUST text):** Part II’s “policy surfaces **MUST** be inspectable” (§32) and Part III (§**36**–**48**) include additional **MUST** / **MUST NOT** language for a reference client. Part III is **not** interoperability core. Scan **§41** (edit semantics), **§42** (offline), **§45** (extensions), and nearby sections for a full list.

| Ref. | Must / must not | § (Part II/III) |
| --- | --- | --- |
| R1 | Policy surfaces must be **inspectable**; see **§32** / **§32.1** (example `GET /relay/policy` shape). | §32 |
| R2 | Example: client **MUST** (Part III) present content-class and ephemeral warnings (**§41**), **MUST** support offline behaviors (**§42**), and extension **MUST**s (**§45**). | Part III |
