# Relay extension and log-event data registry (MVP)

This directory holds **companion** definitions for log event **`data`** shapes and, when applicable, `relay.ext.*` object extensions beyond what is **normative in [Appendix B](../Relay-Stack-Spec-v1-2.md)** of the **Relay v1.2** stack spec.

* **Spec authority:** [Relay-Stack-Spec-v1-2.md](../Relay-Stack-Spec-v1-2.md) — especially **§22** (Extension model) and **Appendix B** (MVP `data` for five `type` values). Entries here **do not override** Appendix B.
* **Goal:** make “**register** before **claiming** interop” for additional `type` values **actionable** with stable JSON files, schema hints, and compatibility rules.
* **Naming:** one primary document per `log_event_type` or `extension_id` (e.g. `log-event.data.trust-attest.v1.json`).

## Layout

| File | Role |
| --- | --- |
| `README.md` | This overview |
| `CONTRIBUTING.md` | Proposal, review, and merge process |
| `log-event.data.*.v1.json` | Seed and future log-event `data` definitions |

## Seed entries (v1 draft)

| Log `type` | File | Status |
| --- | --- | --- |
| `trust.attest` | [log-event.data.trust-attest.v1.json](./log-event.data.trust-attest.v1.json) | Draft |
| `membership.add` | [log-event.data.membership-add.v1.json](./log-event.data.membership-add.v1.json) | Draft |
| `state.revoke` | [log-event.data.state-revoke.v1.json](./log-event.data.state-revoke.v1.json) | Draft |

Implementations **MAY** use these files as the **de facto** `data` contract for interop; breaking changes should bump the `document_version` or the filename version suffix (`v2`).
