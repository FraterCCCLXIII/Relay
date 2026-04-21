🚀 Relay Protocol v1.0

A portable, resilient protocol for public discourse and community publishing

This is written as a real spec-style document, not a brainstorm. It incorporates:

scoped design (not universal)
log + state separation
content classes
layered distribution
trust signals (not personhood dominance)
realistic deletion semantics
governance + extensibility
hybrid (web + relay + optional P2P)
0. Scope
0.1 Purpose

Relay defines a protocol for:

public discourse
community publishing
portable identity and content
resilient distribution without central ownership
0.2 Non-Goals

Relay does NOT define:

universal private messaging (separate profile)
payments or tokens
application UI behavior
ranking or recommendation algorithms
blockchain or consensus systems
1. Core Principles
Identity is portable
Publicness is explicit
Moderation is additive
Distribution is layered
Discovery is external
Trust is plural
Deletion is best-effort, not absolute
2. Core Objects

Relay defines five fundamental object types:

Object	Purpose
Identity	actor definition
Log	immutable events
State	mutable objects
Label	assertions/moderation
Channel	aggregation spaces
3. Actors

Actors are first-class entities.

Types:

user
group
organization
bot (optional classification)
{
  "id": "relay:actor:abc123",
  "kind": "user",
  "identity_doc": "https://example.com/.well-known/relay.json"
}
4. Identity Model
4.1 Identity Document

Self-certifying, signed by actor key.

Contains:

actor ID
active keys
recovery configuration
feed endpoints
state endpoints
trust signals
optional mailbox endpoints
4.2 Resolution

Clients MUST attempt resolution in order:

Direct URL
DNS-based handle
DHT lookup (optional)
Mirror lookup
Cached/out-of-band copy

Signature validity is authoritative.

4.3 Recovery

Supported:

recovery key
guardian (M-of-N)
organization recovery

Guardian recovery:

threshold signatures
time delay
original key veto window
5. Trust Signals

Relay defines trust signals, not a single hierarchy.

Examples:

cryptographic_only
continuity_proven
social_vouch
domain_verified
org_verified
proof_of_personhood

Rules:

signals are signed
visible to all clients
interpreted locally by communities/indexers
6. Content Classes

Every content object MUST declare a class:

Class	Description
durable_public	permanent, fully readable
mutable_public	editable, origin-authoritative
revocable	access-controlled
ephemeral	time-limited
7. Log vs State Model
7.1 Log Objects

Immutable, append-only.

Used for:

follows
moderation events
membership changes
recovery actions
key rotation
revocations
7.2 State Objects

Mutable, versioned.

Used for:

posts
profiles
channel settings
group metadata
7.3 Classification Rules
Object Type	Storage
governance action	Log
identity change	Log
moderation event	Log
user content	State
profile	State
channel config	State
8. Content Semantics Table
Class	Storage	Editable	Mirror Behavior	Deletion
durable_public	Log/State	no	permanent	UI suppression
mutable_public	State	yes	reconcile latest	origin delete
revocable	State	yes	ciphertext only	key revoke
ephemeral	State	yes	TTL cache	expiry + purge
9. Object Schemas
9.1 Log Event
{
  "id": "hash",
  "prev": "hash",
  "actor": "relay:actor:abc",
  "type": "event_type",
  "data": {},
  "ts": 1710000000,
  "sig": "..."
}
9.2 State Object
{
  "id": "post:xyz",
  "actor": "relay:actor:abc",
  "version": 3,
  "type": "post",
  "content": "...",
  "deleted": false,
  "updated_at": 1710000000,
  "sig": "..."
}
9.3 Label
{
  "type": "label",
  "target": "post_id",
  "label": "spam",
  "actor": "relay:actor:moderator",
  "ts": 1710000000,
  "sig": "..."
}
9.4 Channel
{
  "id": "channel:xyz",
  "rules": {},
  "members": [],
  "policy": {
    "trust_floor": "continuity_proven"
  }
}
10. Distribution Model

Relay uses three layers.

10.1 Layer 1 — Feed Storage
static files / object storage
CDN-friendly
cheap to mirror
source of truth
10.2 Layer 2 — Relay Network
websocket / pub-sub
real-time updates
not authoritative
stateless preferred
10.3 Layer 3 — Mirror / Resilience
archive nodes
community mirrors
optional client participation
11. Sync Algorithms
11.1 Log Sync
fetch head
traverse prev
verify signatures
detect forks
11.2 State Sync
fetch latest version
accept highest valid version
discard stale versions
12. Moderation
12.1 Model
additive only
label-based
no global deletion
12.2 Priority
user rules
channel rules
subscribed moderation packs
indexer defaults
13. Amplification Layer

Publishing is permissionless.

Amplification is selective.

Relays/indexers:

define trust floor
apply filtering
publish policies
14. Discovery

External to protocol.

Types:

social graph
channels
curated indexes
algorithmic feeds
search engines
15. Deletion Semantics
15.1 Durable Public
cannot be guaranteed removed
UI suppression only
15.2 Mutable Public
origin-authoritative delete
mirrors SHOULD comply
15.3 Revocable
revoke keys → future unreadable
15.4 Ephemeral
expires
clients MUST purge
no guarantee vs screenshots
16. Threat Model
Threat	Defense	Residual Risk
host loss	mirrors	delayed access
spam flood	amplification filters	long-tail spam
key loss	recovery	partial compromise
moderation capture	plural sources	dominant packs
censorship	mirrors + P2P	regional blocking
17. Governance
17.1 Core Spec
minimal
stable
17.2 Extension Registry
new label types
trust signals
content types
17.3 Process
proposal → review → registry inclusion
clients declare supported extensions
18. Economic Model

Relay does NOT enforce economics.

Relays MAY:

charge for writes
be free with filtering
be community-funded
be invite-only
19. Deployment Modes
Mode	Description
hosted	best UX
hybrid	recommended
p2p	optional, degraded
20. First Target Use Cases

Relay is optimized for:

journalists
niche communities
censorship-resistant publishing
independent forums
deplatformed groups
🧠 Final Summary

Relay is:

a protocol for portable identity and content, where actors publish signed logs and mutable state, channels govern visibility, labels express moderation, static feeds provide durability, relays provide speed, and discovery remains plural and external.