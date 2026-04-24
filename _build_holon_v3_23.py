#!/usr/bin/env python3
"""Build Holonsv3.23.md from Holonsv3.2.md with merged FABRIC + Relay content."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
src = (ROOT / "Holonsv3.2.md").read_text(encoding="utf-8")

# --- Header & intro ---
src = src.replace(
    "# HOLON Protocol v3.2",
    "# HOLON Protocol v3.23",
)
intro_add = """
**What v3.23 is:** The single HOLON specification, merging: (1) the **HOLON** three-layer product model, (2) the **FABRIC** v2.2 application profile (identity, credentials, group/tier encryption, APIs, and documented tradeoffs), and (3) **Relay 2.0** as the **normative truth-and-transport profile** for cryptographically signed events, state, and `relay.feed.definition.v1` view definitions. This document is self-contained for *semantics*; where byte-exact **wire** rules apply, they are defined in **Relay-Stack-Spec v2** (v1.4-1 HTTP).

**Name lineage:** *FABRIC* and *Relay* were separate drafts. **HOLON** is the umbrella name for the complete protocol. Implementations may refer to a "HOLON Relay profile" when speaking of wire-level Event/State/View interop.
"""
src = src.replace(
    "**Design philosophy:** Ship simple, layer complexity, verify everything.\n\n---\n\n## Architecture",
    "**Design philosophy:** Ship simple, layer complexity, verify everything."
    + intro_add
    + "\n\n---\n\n## Architecture",
)

# --- Architecture diagram extension ---
old_arch_end = """│  OBJECT LAYER (required)                                     │
│  Entity │ Content │ Link │ Identity │ Encryption │ Sync     │
└─────────────────────────────────────────────────────────────┘
```

---"""

new_arch_end = """│  OBJECT LAYER (required)                                     │
│  Entity │ Content │ Link │ Identity │ Encryption │ Sync     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  TRUTH & TRANSPORT (Relay 2.0 profile, optional in MVP)      │
│  Signed Identity, Event, State, Attestation; ViewDefinition  │
│  (relay.feed.definition.v1) + explicit boundaries (§0, §20)  │
└─────────────────────────────────────────────────────────────┘
```

*MVP: Object Layer + `seq` sync is enough to ship. **Auditable, cross-origin verifiable views** add the **Relay** profile: append-only **Events**, **State**, signed **ViewDefinitions**, and **Boundary** (aligned with the Relay 2.0 and §10–§17 family in the stack spec).*

---"""

src = src.replace(old_arch_end, new_arch_end)

# --- Object layer: entity seq + custody in example ---
old_ent = """  "version": 1,
  "created": "2026-04-01T00:00:00Z",
  "updated": "2026-04-23T12:00:00Z\""""
new_ent = """  "version": 1,
  "seq": 1,
  "created": "2026-04-01T00:00:00Z",
  "updated": "2026-04-23T12:00:00Z",
  "custody": "provider\""""
src = src.replace(old_ent, new_ent)
src = src.replace(
    "### 2.4 Entity Versioning",
    "### 2.4 `seq` (relay-local)\n\nRelays MAY attach monotonic `seq` to entities, content, and links for cursor sync. `seq` is **relay-local** and not author-signed; see **§7.5** and **Limitations**.\n\n### 2.5 Entity Versioning",
)

# --- Identity: expand §5 ---
old_id = """## 5. Identity

### 5.1 Two Modes

| Mode | Control | Key Management | UX |
|------|---------|----------------|-----|
| **Provider custody** | Provider holds keys | Automatic | Email login |
| **Self-custody** | User holds keys | Manual | Key management |

### 5.2 Email-Derived Identity

For easy onboarding:
```
ent:email:alice@example.com
```

Provider generates and stores keys. User can migrate to self-custody later.

### 5.3 Key-Derived Identity

For self-custody:
```
ent:did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
```

### 5.4 Key Rotation

Keys can be rotated with explicit deprecation:"""

new_id = """## 5. Identity

### 5.0 Three layers (FABRIC model)

| Layer | Role |
|-------|------|
| **Identifier** | Stable `ent:…` (portable across providers) |
| **Authentication** | Proving control (Ed25519 signatures) |
| **Custody** | Who holds private keys today (`provider` / `self` / `threshold`) |

`custody` on an entity: `provider` (default for many email/onboarding flows), `self`, or `threshold` (M-of-N).

### 5.1 Identifier generation (normative)

**Email-derived (for easy onboarding):** `id = "ent:" + base58(sha256(lowercase(email) + "holon.v3.23"))`.

**Key-derived (sovereign / anonymous):** `id = "ent:" + base58(sha256(public_key))` or a DID as `ent:did:…` when used as the stable identifier.

### 5.2 Modes of custody (summary)

| Mode | Control | Key Management | UX |
|------|---------|----------------|-----|
| **Provider** | Provider holds keys | Automatic | Email login |
| **Self** | User holds keys | Manual | Key management |
| **Threshold** | M-of-N | Split + recovery | Balanced (orgs, high-assurance) |

### 5.3 Email and human-readable routing

For easy onboarding, display and routing may use:
```
ent:email:alice@example.com
```

Provider generates and stores keys. User can migrate to self-custody later.

### 5.4 Key-Derived Identity

For self-custody:
```
ent:did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
```

### 5.5 Key Rotation

Keys can be rotated with explicit deprecation:"""

src = src.replace(old_id, new_id)

# Add verification + portability after JSON block, before ## 6. Encryption
rot_anchor = (
    "Signed by the OLD key to prove possession.\n\n---\n\n## 6. Encryption"
)
rot_new = (
    "Signed by the OLD key to prove possession.\n\n"
    "**Verification (normative):**\n\n"
    "1. Rotation MUST be signed by a currently valid signing key.\n"
    "2. After `effective_from`, verifiers MUST reject new signatures that use `revoked_keys`.\n"
    "3. Content with `created` after `effective_from` MUST be signed with the new key; clients MAY warn on content signed with a revoked key when displayed as \"current\".\n"
    "4. The **permanent trust shadow** (a provider that once held keys) is closed for *future* forgeries: the old key cannot sign new content after `effective_from` if verifiers enforce the above.\n\n"
    "### 5.6 Identity portability (provider migration)\n\n"
    "1. Export signed entity + key material from provider A.\n"
    "2. Generate (or import) keys at B; set `custody` appropriately.\n"
    "3. Publish `key_rotation` (old key signs) pointing to the new key.\n"
    "4. Replicate relationships (follow graph) and announce migration as needed.\n\n"
    "---\n\n## 6. Encryption"
)
src = src.replace(rot_anchor, rot_new)

# Access: add unlisted + allow
src = src.replace(
    "| `public` | Anyone can read | No |\n| `private` | Only specified entities | Yes |",
    "| `public` | Anyone can read | No |\n| `unlisted` | Has URL, not in default feeds / discovery | No |\n| `private` | Only specified entities | Yes |",
)
src = src.replace(
    '"recipients": ["ent:bob", "ent:carol"]',
    '"allow": ["ent:bob", "ent:carol"]  // `recipients` is an allowed alias',
)

# Interactions
src = src.replace(
    "| `react` | Reaction to content | User → Content |\n| `bookmark` | Save content | User → Content |",
    "| `react` | Reaction to content | User → Content |\n"
    "| `reply` | Reply link to content (in addition to `reply_to` on **Content**) | User → Content |\n"
    "| `progress` | Course/LMS progress on content | User → Content |\n"
    "| `bookmark` | Save content | User → Content |",
)

# Group: history_policy
old_grp = """    "posting_policy": "members"
  },
  "keys": {"""
new_grp = """    "posting_policy": "members",
    "history_policy": "join_date_forward"
  },
  "keys": {"""
src = src.replace(old_grp, new_grp, 1)

# After tier keys block: add 6.5, 6.6
tier_tail = (
    "  \"key_encrypted_to_subscribers\": { ... }\n"
    "}\n"
    "```\n\n"
    "---\n\n"
    "## 7. Sync"
)
tier_repl = (
    "  \"key_encrypted_to_subscribers\": { ... }\n"
    "}\n"
    "```\n\n"
    "### 6.5 Group `history_policy` (scalability of encryption)\n\n"
    "Groups set `data.history_policy`:\n\n"
    "| Policy | Behavior |\n"
    "|--------|----------|\n"
    "| `join_date_forward` (default) | New members only decrypt content after join; avoids mass re-wrap of old ciphertext. |\n"
    "| `full_access` | New members can read all history; may require re-wrapping (small groups / team vaults only at scale). |\n\n"
    "For `full_access`, optional **content key registry** objects may map `cnt:…` to wrapped keys (see FABRIC v2.2 for extended patterns).\n\n"
    "### 6.6 Ciphertext profiles\n\n"
    "Payloads MAY use **XChaCha20-Poly1305**; the same logical model as **XSalsa20-Poly1305** in §6.1. `encrypted` objects SHOULD name `algorithm`, `nonce` or AEAD fields, and `wrapped_keys` / group or tier `*_key_version`.\n\n"
    "---\n\n"
    "## 7. Sync"
)
src = src.replace(tier_tail, tier_repl)

# Sync 7.5, 7.6
src = src.replace(
    "Clients track cursors per relay and deduplicate by object ID.\n\n---\n\n## 8. Groups",
    "Clients track cursors per relay and deduplicate by object ID.\n\n"
    "### 7.5 Ordering and timestamps\n\n"
    "Author-controlled `created` is **gameable** for display order. **Recommendations:** use a soft tuple `(`created`, relay_first_seen, relay_id)`; record `relay_received_at`; for **cryptographic** ordering, use **Relay Events** (signed predecessor chain) in the **Truth layer** (§0).\n\n"
    "### 7.6 Multi-relay merge\n\n"
    "Prefer higher `version` (entities) or identical `id`+payload. Conflicting content without a shared signed log is **policy-local** to clients and indexers.\n\n"
    "---\n\n## 8. Groups",
)

# API
src = src.replace(
    "GET    /keys/tier/{pub}/{tier}  Get tier key (with credential)\n```",
    "GET    /keys/tier/{pub}/{tier}  Get tier key (with credential)\n"
    "POST   /keys/tier/{pub}/{tier}/request  Request tier key (subscribers)\n```",
)

# Truth layer before STRUCTURE
marker = (
    "**This is a complete, shippable protocol.**\n\n"
    "---\n\n"
    "# STRUCTURE LAYER"
)
truth_block = (
    "**This is a complete, shippable protocol.**\n\n"
    "---\n\n"
    "# TRUTH LAYER AND RELAY 2.0 (TRANSPORT / VERIFICATION PROFILE)\n\n"
    "Optional in MVP; **expected** for **auditable, portable interop** with other HOLON/Relay peers.\n\n"
    "## 0.1 Primitives (Relay 2.0)\n\n"
    "| Primitive | HOLON role |\n"
    "|-----------|------------|\n"
    "| **Identity** | Actor + keys; aligns with HOLON **Entity** signing keys |\n"
    "| **Event** | Append-only, signed, content-addressed facts |\n"
    "| **State** | Versioned current object (profiles, channel config, **ViewDefinition**) |\n"
    "| **Attestation** | Claims that do not override Event/State facts |\n"
    "| **ViewDefinition** | **State** with `type: relay.feed.definition.v1`, fields `sources`, `reduce`, optional `params` |\n\n"
    "HOLON **Entity / Content / Link** may be projected into **State** and/or **Event** logs. Exact **byte** and **HTTP** rules: **Relay-Stack-Spec** (v1.4-1 on the wire for current deployments).\n\n"
    "## 0.2 HOLON `view` and Relay ViewDefinition\n\n"
    "| HOLON | Relay |\n"
    "|-------|-------|\n"
    "| `view.source` + `filter` + `sort` + `limit` | `sources` + `reduce` + `params` |\n"
    "| `boundary` (§26) | **Boundary** / snapshot inputs (finite, explicit) for recompute (Relay §17) |\n"
    "| `view_execution.result_hash` | Recompute / audit hash in Relay profile |\n\n"
    "Authoring may use the human-readable **HOLON `view`**; **conformant** deployments store/execute the canonical **ViewDefinition** state for interoperability.\n\n"
    "## 0.3 Forks\n\n"
    "Divergent valid branches are preserved; there is no protocol-enforced single global \"winner\" (Relay policy: origin + identity + client/indexer policy).\n\n"
    "---\n\n"
    "# STRUCTURE LAYER"
)
src = src.replace(marker, truth_block)

# View layer: §20
src = src.replace(
    "# VIEW LAYER\n\nOptional. Adds programmable, verifiable feeds.\n\n---\n\n## 21. Views as First-Class Objects",
    "# VIEW LAYER\n\nOptional. Adds programmable, verifiable feeds.\n\n---\n\n## 20. Relay ViewDefinition (interop)\n\n"
    "On Relay: represent feeds as **signed State** with `type: relay.feed.definition.v1` and `sources`, `reduce`, optional `params`. **HOLON** `view` JSON remains the **authoring** form; **bridges** map to the canonical **ViewDefinition** (see **§0.2**).\n\n"
    "---\n\n## 21. Views as First-Class Objects",
)

# Limitations
src = src.replace(
    "# COMPARISON\n\n---\n\n## 33. Protocol Comparison",
    "# LIMITATIONS, TRADEOFFS, AND KNOWN GAPS (v3.23)\n\n"
    "Merged from **FABRIC**; explicit so implementers are not surprised.\n\n"
    "- **L1** — Relay `seq` is not author-signed. Use **Events** for verifiable order.\n"
    "- **L2** — No global spam rule in core. Use relay policy, rate limits, PoW/stake as appropriate.\n"
    "- **L3** — Attestor discovery is allow-list / publication-local (`trusted_payment_attestors`), not a global directory.\n"
    "- **L4** — Schema registry is out of core; `_display` gives graceful fallback.\n"
    "- **L5** — High-volume **links** (e.g. reactions) may need aggregation or **State** materialization at scale.\n"
    "- **L6** — Moderation is scoped (labels, roles); there is no global ban list in protocol.\n"
    "- **L7** — **§7.5** timestamp gameability; mitigations are operational or Event-based.\n\n"
    "# COMPARISON\n\n---\n\n## 33. Protocol Comparison",
)

src = src.replace(
    "| Feature | HOLON v3.2 | Nostr | AT Protocol | ActivityPub |",
    "| Feature | HOLON v3.23 | Nostr | AT Protocol | ActivityPub |",
)
src = src.replace(
    "| **View Layer** |\n| Programmable views | ✓ | ✗ | ✗ | ✗ |",
    "| **Truth / Relay wire** | ✓ (optional) | ✗ | Partial | ✗ |\n| **View Layer** |\n| Programmable views | ✓ | ✗ | ✗ | ✗ |",
)

src = src.replace(
    "| Instance | Relay + optional parent holon |\n\n---\n\n# IMPLEMENTATION GUIDE",
    "| Instance | Relay + optional parent holon |\n\n"
    "### 34.3 From FABRIC v2.2 and Relay 2.0 drafts\n\n"
    "| Draft | v3.23 |\n|-------|-------|\n| FABRIC v2.2 | Merged into Object + Identity + Limitations |\n| Relay 2.0 / Stack Spec | Truth + ViewDefinition; **§0**, **§20** |\n\n"
    "---\n\n# IMPLEMENTATION GUIDE",
)

src = src.replace(
    "*Protocol version: 3.2*\n*Status: Draft*\n*License: CC0 (Public Domain)*",
    "*Protocol version: 3.23*\n*Status: Draft*\n*License: CC0 (Public Domain)*\n\n"
    "## Changelog (v3.23)\n\n"
    "- Merged **FABRIC** v2.2: three-layer identity, `custody`/`threshold`, email id derivation, key-rotation rules, `history_policy`, unlisted access, `reply`/`progress`, `allow` for private, tier key `POST` request, ordering notes.\n"
    "- Merged **Relay 2.0** profile: Truth layer section (**§0**), ViewDefinition interop (**§20**), fork note, **Limitations**.\n"
    "- Architecture: **Truth & transport** stratum; entity example includes `seq` and `custody`.\n",
)

out = ROOT / "Holonsv3.23.md"
out.write_text(src, encoding="utf-8")
print(f"Wrote {out} ({len(src)} bytes)")
