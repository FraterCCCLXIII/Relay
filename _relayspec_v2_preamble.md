## 0. Relay 2.0 model (read this first)

**Status (this section):** Draft 0.4 — two-layer **architecture** (Truth Layer + View Layer), **5** truth-facing primitives + **1** view entry point (**ViewDefinition**), with **v1.4-1** as the **normative** **HTTP** and **envelope** **encoding** in Parts I+ below.

**Design rule:** Relay 2.0 defines **what is true** and **what can be derived**, not how UIs are styled. Presentation, ranking, and most product behavior are **Views** (deterministic over explicit **boundaries**).

### 0.1 Migration (from v1.4 naming)

| v1.4 / v1.5 in this spec | Relay 2.0 concept |
| --- | --- |
| **Log** event | **Event** (`relay.event.v1` **role**; **wire** in **§10** uses **`ts`**, **`prev`**, not a top-level **`kind`:**) |
| **State** object | **State** (`relay.state.v1` **role**; **wire** in **§11**) |
| **Channel** config / metadata | **State** with a channel `type` (see **§13**) |
| **membership.*** on log | **Event** types (same `type` **strings**) |
| **action.*** (request, commit, result) | **Event** types (Appendix C) |
| **`relay.feed.definition.v1`** | **ViewDefinition** — **signed** **State** that names **inputs** and a **versioned** **reduce** **function** |
| v1 **`prev`** | **2.0** **parents** (often **one** **parent**); **v1.4-1** **wire** **unchanged** |

### 0.2 Truth primitives (2.0)

* **Identity** — **§8**; **public** **keys** and **`actor_id`** (**§4.3**).
* **Event** — **immutable** **append** **per** **actor**; **§10**, **POST** **§16.3**, **GET** **§17.3**–**§17.4**.
* **State** — **versioned** **authoritative** **object**; **§11**, **§16.1**, **§17.5**.
* **Snapshot** (where offered) — **verifiable** **checkpoints**; `relay.snapshot.v1` **`scope`** is a **composable** **filter** object (**§0.5**); **compare** only with **same** **`scope`**, **`as_of`**, and **ordering**; **MUST** **not** be **treated** as **interchangeable** with **arbitrary** **non-snapshot** **boundaries** (**§0.7**).
* **Attestation** — **§6**; **MUST** **not** **override** **Event** / **State** **facts**; **Relay 2.0** **`claim`** **classification** (**§6.2.0**).
* **Verifiability profile** — **§0.8**; implementations **MUST** **declare** **`relay.profile.minimal`** or **`relay.profile.auditable`** (or both if multiple surfaces exist).

### 0.3 View layer (2.0)

* **ViewDefinition (normative mapping)** — **MUST** be **implemented** **only** as **signed** **State** with **`type`:** **`relay.feed.definition.v1`** (**§11.1**). **No** **alternate** **protocol-level** **representation** **permitted**; **wire** **fields** are **`sources`**, **`reduce`**, optional **`params`**.
* **Boundary** — **Single** **normative** **definition** is **§0.6**; **v1.4-1** **recompute** / **audit** **advice** in **§17.11** **MUST** be **read** in **light** of **§0.6**–**§0.7** for **2.0** **determinism** **claims**.
* **Target** **REST** (2.0 **sketch**, **not** **required** **on** **the** **wire** **today**): **`GET` `/view/{id}/run?boundary=…`**; **deployed** **origins** use **`/actors/...`** **paths** in **§16**–**§17**.

### 0.4 API mapping (2.0 target vs this document’s HTTP)

| 2.0 **target** | **Normative** **v1.4-1** **surface** (this spec) |
| --- | --- |
| `POST /event` | `POST /actors/{actor_id}/log` (append **Event** **envelope**) |
| `GET /event/{id}` | `GET /actors/.../log/events/{event_id}` |
| `PUT` / `GET` `/state/...` | `PUT` / `GET` `/actors/.../state/...` |
| `GET /view/.../run` | **Not** a **separate** **MUST**; use **recompute** from **§17.10** + **fetches** (**§17.11**). |

### 0.5 Canonical JSON sketches (2.0 target; **not** v1.4-1 on-the-wire)

*Normative machine rules for `relay.snapshot.v1` **scope** and for **Boundary** are **§0.5** (scope shape in sketches below), **§0.6**, and **§0.7**.*

The **objects** **below** are **reference** **shapes** for **new** **implementations** and **for** **mapping** **mental** **models** **to** **§8**, **§10**, **§11** **( **v1** **envelopes** **)**. **Field** **names** **and** **required** **keys** **on** **the** **wire** **remain** **exactly** **as** in **the** **numbered** **sections** **(Part** **I) **.

#### Identity (2.0 sketch)

```json
{
  "kind": "relay.identity.v1",
  "id": "relay:actor:multihash(public_key)",
  "public_key": "base64(ed25519 public key)",
  "created_at": "2026-04-22T00:00:00Z",
  "sig": "base64(signature)"
}
```

**Rules (2.0):** `id` = **multihash**(**SHA-256**(**public_key**)) **(see** **§4.3) **; ** no **economic** **/ ** **reputation** at **this** **layer**; **`sig` **MUST** **verify**.

#### Event (2.0 sketch; v1 **§10** uses `prev`, `ts`, …)

```json
{
  "kind": "relay.event.v1",
  "id": "relay:event:multihash(content)",
  "actor": "relay:actor:abc",
  "type": "string",
  "data": {},
  "parents": ["relay:event:..."],
  "timestamp": "2026-04-22T00:00:00Z",
  "sig": "base64(signature)"
}
```

**Rules (2.0):** **content-addressed**; **immutable**; **`parents` **MAY** be **unresolved** at **append**; **verifiers** **MUST** treat **unresolved** **parents** as **unverified** **until** **fetched**.

#### State (2.0 sketch; v1 **§11** `created_at` / `updated_at`, …)

```json
{
  "kind": "relay.state.v1",
  "id": "relay:state:user-defined",
  "actor": "relay:actor:abc",
  "type": "string",
  "version": 4,
  "data": {},
  "parents": ["relay:event:..."],
  "timestamp": "2026-04-22T00:00:00Z",
  "sig": "base64(signature)"
}
```

| Concept | Meaning |
| --- | --- |
| **Event** | What happened (audit) |
| **State** | What is true now (read path) |

**Rules (2.0):** **`version` **MUST** **increment**; **State** **is** **authoritative** for **reads**; **Event** **chain** **is** **authoritative** for **audit**; where **both** **exist, ** **State** **SHOULD** be **derivable** from **Event** **history** **( **profiles** **MAY** **require** **stricter** **rules** **)**.

#### Snapshot (2.0 sketch)

`relay.snapshot.v1` **MUST** carry **`scope`** as a **closed**, **composable** **filter** object (not a free-form `scope.kind` / `value` pair). **Removed:** **`actor_prefix`** (ambiguous).

```json
{
  "kind": "relay.snapshot.v1",
  "id": "relay:snapshot:multihash(root_hash)",
  "actor": "relay:actor:origin",
  "root_hash": "hex",
  "state_count": 15234,
  "as_of": "2026-04-22T00:00:00Z",
  "partial": false,
  "scope": {
    "actors": ["relay:actor:abc"],
    "types": ["post"],
    "id_range": {
      "from": "relay:state:...",
      "to": "relay:state:..."
    }
  },
  "sig": "base64(signature)"
}
```

| Field | Type | Semantics |
| --- | --- | --- |
| `actors` | array of string | **Exact** **match** on `actor_id` (state owner / publisher as defined for the state object). |
| `types` | array of string | **Exact** **match** on state **`type`**. **MUST** **not** use partial / prefix matching. |
| `id_range` | object | Inclusive **lexicographic** **interval** over **`state.id`**. `from` and `to` **MUST** **define** a **closed** **interval** (both **ends** **included**). If **`from` **> **`to` **lexicographically, the **interval** **is** **empty** **and** **`id_range` **MUST** **be** **rejected** **as** **invalid**. |

**Scope evaluation (normative):**

* **Conjunction (AND):** `scope` **MUST** be **interpreted** as the **conjunction** of **all** **present** **filters**; a **key** **absent** **or** an **empty** **array** **for** **`actors` **/ ** `types` **imposes** **no** **constraint** **in** **that** **dimension** **( **except** **as** **required** **by** **`partial` **, ** **below** **). **
* **When** **`partial` **is** **`true`**, **`scope` **MUST** **not** be **`{}` **; **it** **MUST** **contain** **at** **least** **one** **constraining** **field** ( **non-empty** **`actors` **or** **`types` **, ** **or** **valid** **`id_range` **with** **`from` **≤** **`to` **).**
* **When** **`partial` **is** **`false`**, the **snapshot** is **a** **full** **cut** per **the** **origin** **( **entire** **agreed** **state** **universe** **for** **that** **snapshot** **, ** **subject** **to** **origin** **policy** **); **`scope` **MAY** be **`{}` **( **no** **additional** **AND** **filters** **) ** **or** **MAY** **list** **explicit** **filters** **. **

**Canonical evaluation:** Implementations **MUST** **apply** **filters** in **any** **order** (**order-independent**). **Identical** **`scope` **+ **`as_of` **+ **same** **state** **set** **MUST** **yield** **identical** **membership** for **the** **snapshot** **( **before** **Merkle** **)**. **

**Comparability:** Two **snapshots** are **portably** **comparable** **for** **deterministic** **View** **use** **iff** **they** have **the** **same** **canonical** **`scope` **object, **the** **same** **`as_of`**, and **the** **same** **lexicographic** **sort** **and** **leaf** **hash** **rules** ( **Merkle:** **sort** **by** **`id`**, **leaf** = **SHA-256**(**canonical** **state** **JSON**)). **MUST** **not** **assume** **equivalence** **otherwise**. **

**Proof** (sketch object):

```json
{
  "kind": "relay.snapshot.proof.v1",
  "snapshot_id": "...",
  "state_id": "...",
  "merkle_path": [],
  "leaf_index": 42,
  "root_hash": "..."
}
```

#### Attestation (2.0 sketch) — **normative** **`claim`** **shape** **aligns** **§6.2.0**; **§6.2** **shows** **v1.2** **trust** **wire** (flat **`type`**).

```json
{
  "kind": "relay.attestation.v1",
  "id": "...",
  "issuer": "relay:actor:abc",
  "claim": {
    "category": "trust | snapshot | view",
    "type": "string",
    "payload": {}
  },
  "expires_at": "...",
  "supersedes": "...",
  "sig": "..."
}
```

| Category | Purpose |
| --- | --- |
| `trust` | Identity or reputation claims ( **includes** **wire** **types** in **§6.3** **when** **normalized** **per** **§6.2.0** **). |
| `snapshot` | Claims about **snapshot** **correctness** / **membership** **/ ** **root**. |
| `view` | Claims about **computed** **View** **outputs** **( **e.g. ** **attested** **hashes** **)** . ** |

**Rules (2.0):** **`claim.category` **MUST** **be** **present** **on** **Relay 2.0** **general** **attestations** **( **§6.2.0** **)** . ** **MUST** **not** **override** **Truth** **primitives**; **unknown** **`claim.type` **values** **within** **a** **known** **`category` **MUST** be **ignored** **safely** **( **extension** **policy** **)** . **

#### ViewDefinition (2.0 sketch) — **wire** **MUST** **use** **`relay.feed.definition.v1`** (**§11.1**); **no** **`relay.view.definition.v1`** **or** **other** **parallel** **`type`**.

```json
{
  "kind": "relay.state.v1",
  "id": "relay:view:my_view",
  "type": "relay.feed.definition.v1",
  "version": 3,
  "data": {
    "sources": [],
    "reduce": "relay.reduce.reverse_chronological.v1",
    "params": {}
  },
  "sig": "..."
}
```

**Determinism (2.0):** **Formal** **definition** **—** **§0.6** **( **pure** **View** **function** **)** . ** **At** **minimum** **a** **View** **evaluation** **is** **deterministically** **equivalent** **iff** **same** **ViewDefinition** **`version`**, **same** **Boundary** (**§0.6**), **and** **same** **resolved** **input** **data** **( **see** **§0.6** **)**. **

**Boundary** ( **normative** **object** **—** **full** **rules** **§0.6** **); **illustration** **only** **:**

```json
{
  "snapshot": "relay:snapshot:...",
  "event_range": { "from": "relay:event:…", "to": "relay:event:…" },
  "state_scope": { "actors": ["relay:actor:abc"], "types": ["post"] }
}
```

Without a **valid** **Boundary** (**§0.6**), a **stated** **result** **is** **“** **latest** **available** **”** **/ ** **best-effort** **—** **not** **reproducible** **/ ** **not** **audited** **( **§0.3** **, ** **§17.11** **)**. **

**View run** (response **sketch**):

```json
{
  "view_id": "...",
  "definition_version": 3,
  "boundary": {},
  "result": [],
  "result_count": 100,
  "attestation": { "root_hash": "...", "proof_available": true }
}
```

**Input kinds** and **core** **reduce** **families** **( **2.0** **naming** **— ** **see** **§17.10** **for** **normative** **ids** **)**:

| Input kind (2.0) | Meaning |
| --- | --- |
| `actor_log` | Events from an actor |
| `snapshot` | State set (bounded) |
| `event_type` | Filtered events |
| `view` | Nested view |

| Function family | Description |
| --- | --- |
| chronological / reverse_chronological | Order |
| union / intersection | Set ops |

#### Key guarantees (summary)

* **Truth:** **Signed**, **addressable**; **State** **for** **reads**; **Events** **for** **audit** (**Part** **I**).
* **View:** **Deterministic** **only** **with** **Boundary** **§0.6**; **ViewDefinition** **only** **`relay.feed.definition.v1`** (**§0.3**); **recomputable** (**§17.11**).
* **Snapshot:** **Merkle**-**verifiable** **root**; **`scope`** **filter** **object** **§0.5**; **not** **interchangeable** **with** **arbitrary** **non-snapshot** **boundaries** (**§0.7**).

### 0.6 Boundary definition (normative)

A **Boundary** **defines** **the** **exact** **dataset** **( **up** **to** **explicit** **limits** **)** ** over **which** a **View** **is** **evaluated** **and** **over** **which** **determinism** **and** **audit** **claims** **MUST** **be** **scoped** **. **

**Boundary object** ( **all** **top-level** **keys** **optional** **unless** **a** **profile** **requires** **a** **specific** **pin** **; ** at **least** **one** **sufficient** **constraint** **MUST** **be** **present** **for** **a** **reproducible** **claim** **):**

```json
{
  "snapshot": "relay:snapshot:...",
  "event_range": {
    "from": "relay:event:...",
    "to": "relay:event:..."
  },
  "state_scope": {
    "actors": ["relay:actor:abc"],
    "types": ["post"],
    "id_range": { "from": "relay:state:...", "to": "relay:state:..." }
  }
}
```

**`state_scope`** **uses** **the** **same** **filter** **semantics** **as** **snapshot** **`scope`** **( **AND** **of** **present** **filters** **; ** **§0.5** **table** **)** . **

**Rules:**

* A **valid** **Boundary** **MUST** **fully** **constrain** **all** **inputs** **the** **ViewDefinition** **requires** **( **e.g. ** **per-source** **log** **windows** **, ** **state** **heads** **, ** **definition** **`version` **, ** or **a** **pinning** **snapshot** **)** **. **
* A **Boundary** **MAY** **include** **a** **snapshot** **reference**, **one** **or** **more** **event** **ranges** **( **inclusive, ** **finite** **endpoints** **over** **the** **event** **id** **space** **as** **used** **by** **the** **deployment** **)** **, ** and/or **state** **filter** **fields** **via** **`state_scope`**. **
* A **Boundary** **is** **valid** **iff** **all** **referenced** **data** **is** **resolvable** **and** **all** **ranges** **are** **finite** **( **no** **unbounded** **“** **to** **” ** **=** ** infinity** **)**. **

**Determinism rule (Views):** Two **View** **evaluations** **MUST** be **treated** as **deterministically** **equivalent** **iff** **all** of **the** **following** **hold** **: ** the **same** **ViewDefinition** **`version`**, the **same** **Boundary** **value** ( **after** **canonicalization** **per** **implementation** **rules** **), and **the** **same** **underlying** **resolved** **input** **bytes** **( **log** **events** **, ** **state** **objects** **, ** **nested** **definitions** **at** **pinned** **versions** **)**. **

**View function purity (normative):** A **reducer** / **View** **function** **MUST** **not** **depend** **on**: **(1)** **current** **wall** **clock**, **`Date.now`**, or **any** **unspecified** **“** **now** **”** **( **time** **MAY** **appear** **only** **as** **part** **of** the **Boundary** **or** **input** **objects** **); ** **(2)** **non-deterministic** **randomness** **; ** **(3)** **external** **network** **calls** **; ** **(4)** **non-specified** **host** **or** **process** **state** **( **e.g. ** **unordered** **map** **iteration** **without** **canonical** **order** **). ** It **MUST** **operate** **only** **on** the **ViewDefinition** **and** **Boundary**-**defined** **inputs** and **MUST** **yield** **identical** **output** **for** **identical** **inputs** **. **

**Enforcement:** Implementations **MUST** **treat** **any** **violation** **as** **non-deterministic** **output** **. ** They **MUST** **not** **claim** **bit-for-bit** **equivalence** **or** **universal** **audit** **parity** **across** **deployments** **for** **non-deterministic** **outputs** **. **

### 0.7 Snapshot and boundary (normative relationship)

* A **Snapshot** is **a** **specialized** **form** of **constraint** **that** **can** **serve** as **( **or** **contribute** **to** **)** a **Boundary**, **but** **is** **not** **the** **only** **way** **to** **define** one **. **
* A **Boundary** **MAY** **reference** a **snapshot** **`snapshot` **; **MAY** **define** **raw** **event** **windows** **with** **`event_range` **; **MAY** **define** **state** **filters** **with** **`state_scope` **( **independent** **of** **a** **snapshot** **or** **with** **it** **)**. **
* A **Snapshot** **object** **implicitly** **fixes** a **state** **membership** **set** **( **constrained** **by** **`scope` **+ **`as_of` **) **. ** A **Boundary** **that** **sets** **`snapshot` ** **inherits** those **membership** **and** **temporal** **commitments** **( **`as_of` **, ** **filter** **semantics** **)** **. **
* A **Boundary** **without** **`snapshot` ** **MUST** **define** **all** **required** **constraints** **explicitly** **( **e.g. ** **per-source** **heads** **+ ** **state** **filters** **)** in **a** **manner** **verifiable** **for** **the** **claim** **. **

**Constraint:** Implementations **MUST** **not** **assume** **snapshot-** **pinned** **boundaries** and **unpinned** **range** / **state_scope**- **only** **boundaries** are **interchangeable** **for** **the** **same** **View** **without** **a** **proof** **( **e.g. ** **showing** **the** **same** **state** **set** **and** **event** **windows** **)**. **

### 0.8 State and event verifiability profiles (normative)

*These **verifiability** **profiles** (**minimal** / **auditable** **state** **wrt** **events**) are **orthogonal** **to** **Part** **I** **capability** **profiles** **( **e.g. ** **`relay.profile.social` **, ** **§2.1** **). ** A **single** **deployment** **MUST** **declare** **both** **when** **both** **axes** **apply** **. **

Implementations **MUST** **declare** **at** **least** **one** **verifiability** **profile** **( **e.g. ** on **identity** **, ** **capabilities** **, ** or **a** **well-known** **document** **)** **. **

| Profile | Requirement |
| --- | --- |
| **`relay.profile.minimal`** | **State** **MAY** **exist** without **a** **complete** **verifiable** **event** **history** on **that** **actor** ( **e.g. ** **migrated** **or** **origin**- **sourced** **only** **)**. ** |
| **`relay.profile.auditable`** | **State** **MUST** be **derivable** **( **reconstructable** **)** from **a** **finite** **set** of **Event** **objects** **the** **client** **can** **fetch** and **the** **protocol** **rules** **allow** for **the** **state** **type** **. ** |

**`relay.profile.auditable` (additional rules):**

* **State** **MUST** **include** **parent** **( **e.g. ** **`prev` **- ** **linked** **or** **schema-specific** **)** **or** **equivalent** **references** such **that** **verifiers** **MAY** **reconstruct** **or** **verify** **derivation** **from** **events** **( **as** **defined** for **the** **state** **type** **)**. **
* **Verifiers** **MUST** be **able** **to** **reconstruct** **the** **state** **or** **reject** **as** **non-auditable** when **reconstruction** **fails** **( **per** **local** **policy** **)**. **

**Clients** **MUST** **respect** **the** **declared** **profile** when **deciding** **whether** **to** **show** **“** **verified** **”** **derivation** **vs** **“** **origin**- **attested** **only** **”** **. **
