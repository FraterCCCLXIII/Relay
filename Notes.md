
Tier 1 — High impact, implementable now
Explanation objects
This is the single best addition available. No deployed protocol makes "why are you seeing this" a signed, verifiable primitive. It fits the existing label architecture exactly, costs almost nothing to implement, and is a genuine differentiator. The spec already has the groundwork — it's one new object type and one registry entry.
json{
  "type": "explanation",
  "target": "post:123",
  "reason_type": "followed_actor|channel_ref|label_match|indexer_boost",
  "issuer": "relay:actor:indexer",
  "ts": "...",
  "sig": "..."
}
Every other protocol either omits this entirely or buries it in proprietary API responses that can't be verified. Making it a signed protocol object means users can audit it, third parties can verify it, and products can't silently lie about it.
Explicit multi-origin failover semantics
The identity document already has an origins array but the spec doesn't say what clients should do when the primary origin is unavailable. This is a one-paragraph normative addition that dramatically improves resilience in practice:

Try origins in declared order
If primary unreachable after N seconds, try next
Signature verification makes any mirror trustworthy
Client stores last-known-good origin for offline reads

This costs nothing architecturally and fixes a real operational gap.
Snapshot diff protocol
Currently clients either fetch full snapshots or poll individual objects. There's no way to say "give me everything that changed since snapshot X." This produces a painful tradeoff — heavy full syncs or chatty per-object polling. A simple diff endpoint:
GET /actors/{actor_id}/state/diff?since_snapshot={snapshot_id}
Returns only objects modified since that snapshot, with their current versions. This is how every successful sync protocol works (CRDTs, OT, rsync) and its absence is a real implementation pain point.
The relay.profile.community tier
The current three profiles — minimal, social, full — skip a crucial middle ground. A community profile would add:

Membership log semantics
Channel policy enforcement
Basic moderation label handling

This is the profile that forum operators, community managers, and deplatformed groups actually need. It's the stated primary use case and it doesn't have its own profile tier. That gap will cause fragmentation when the first community implementations appear.

Tier 2 — High impact, needs design work
Portable membership witness
This is the largest remaining security gap in the spec. The spec acknowledges it honestly — members-only channels reduce to trusting the channel origin. The fix is a signed attestation that an actor held membership at a given time, verifiable without contacting the origin:
json{
  "type": "membership.witness",
  "actor": "relay:actor:alice",
  "channel": "relay:channel:tech",
  "valid_from": "...",
  "valid_until": "...",
  "issuer": "relay:actor:channel-owner",
  "sig": "..."
}
This is technically straightforward but requires careful design around revocation, expiry, and what happens when membership witnesses contradict current membership state. The design work is real but the payoff is significant — it's the difference between "trust the origin" and "verify independently."
Context bundles
A signed, portable set of object references for curation:
json{
  "type": "context.bundle",
  "objects": ["post:abc", "post:def"],
  "labels": ["relay:label:xyz"],
  "curator": "relay:actor:alice",
  "ts": "...",
  "sig": "..."
}
No summary field — that's an application concern. Just references. This turns Relay from a raw content distribution protocol into something that supports portable curation and sense-making. A journalist packages their sources. A community manager curates a thread. A researcher bundles related posts. These bundles are themselves first-class signed objects that can be followed, mirrored, and verified like anything else.
Forward-secret private channels
The spec has revocable content but no specification for private group messaging with forward secrecy. The mailbox endpoint in the identity document is a pointer to a separate protocol. The gap is that communities need private channels that work within the same mental model as public channels — same membership semantics, same moderation primitives, just encrypted. The Double Ratchet algorithm handles forward secrecy for two-party messaging. Multi-party forward secrecy is harder but Messaging Layer Security (MLS, RFC 9420) is the current best answer and is worth specifying as an extension.
Delegation and co-authorship
Right now only the actor or their origin can modify a state object. But real community publishing involves delegation — an organization wants multiple people to publish under the org's identity, a community wants trusted contributors to edit shared documents, a publication wants editors to modify articles. The spec has no model for this. A delegation attestation:
json{
  "type": "delegation",
  "delegator": "relay:actor:org",
  "delegate": "relay:actor:alice",
  "scope": "state.publish|label.issue",
  "expires_at": "...",
  "sig": "..."
}
Signed by the delegator, referenced in publication events to prove authority. This is a significant capability gap for organizational and community use cases.

Tier 3 — Architectural improvements worth considering
Content-addressed extensions
The current extension model requires a registry — someone writes a spec, puts it in a directory, others optionally adopt it. The more elegant alternative is making extensions self-describing content-addressed objects:
json{
  "id": "relay:ext:sha256-of-schema",
  "schema": { ... machine-readable ... },
  "author": "relay:actor:abc",
  "sig": "..."
}
Extensions are identified by hash of their schema, not by name. No registry needed. Two implementations discover shared extensions by exchanging IDs. This is architecturally consistent with the rest of Relay — everything else is content-addressed and signed, extensions should be too. The registry approach will produce the same fragmentation NIPs produced in Nostr.
The identity document as a log head
Currently identity is a mutable state object. The more consistent model: identity is the current head of an identity log, where each entry is a signed update. Key rotation becomes a log entry. Recovery becomes a fork in the identity log resolved by recovery key authority. Guardian signatures appear as log events with standard signing semantics. This eliminates several special cases — the key.rotate event type, the separate recovery workflow, the updated_at field — and makes identity history cryptographically auditable using exactly the same machinery as content history. The cost is a migration from the current model. The benefit is significant reduction in special-case complexity.
Probabilistic spam resistance
The current spam model relies entirely on relay and indexer policy, which is correct but leaves a gap for new accounts with no reputation. A lightweight addition: a simple hashcash-style proof of work for first-contact messages and new account publishing. Not required for all operations — just as an optional signal that a new actor did some computational work. This is Tier 3 because it's an optimization, not a structural gap, and the trust signal system partially covers this case already.

Tier 4 — Worth watching but not yet
DAG event references for knowledge graphs and debate structures. Real use case, real value, but belongs in an extension that specific communities adopt. Not core.
Gossip propagation for public content resilience. The architecture is sound but specifying it properly requires answering hard questions about privacy, storage budgets, and mobile constraints. Worth a companion spec when the first implementation wants it.
Capability documents separate from identity. The spec already acknowledges this is deferred. The relay_profiles field on the identity document mixes actor identity with server capability advertisement. Separating them cleanly matters more as deployments become more complex — a single domain might host multiple actors with different capability sets. Straightforward to add, just hasn't been prioritized.

The honest priority ordering
If I were allocating implementation effort:
First: explanation objects and multi-origin failover. Both are small, both are high value, both are immediately differentiating.
Second: snapshot diff protocol and the community profile tier. These unblock the primary use case — community deployments — and fix a real sync performance problem.
Third: portable membership witness and context bundles. These address the two largest capability gaps for the communities Relay is targeting.
Fourth: delegation, content-addressed extensions, identity-as-log. These are architectural improvements that pay off at scale and make the spec more internally consistent, but they require careful design and potentially breaking changes.
The spec is already better than deployed alternatives on the problems it tackles. The opportunities above are mostly about closing the gap between "technically sound" and "practically complete for the stated use cases." The explanation object is the one that would make the most people sit up and notice — it's the kind of feature that doesn't exist anywhere else and immediately makes sense to anyone who has ever wondered why an algorithm showed them something.