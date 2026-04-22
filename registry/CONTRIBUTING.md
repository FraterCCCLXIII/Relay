# Contributing to the registry

## Who can submit

Anyone may propose a new entry or a non-breaking clarification via pull request. **Compatibility** and **security** (especially signature-affecting or trust-affecting fields) are the main review topics.

## Proposal process

1. **Open an issue (optional but recommended)** describing the new log `type` `data` shape or `relay.ext.*` extension, the interoperability problem it solves, and any prior art.
2. **Add or update a JSON file** in `registry/` following the structure in existing seeds (`kind`, `log_event_type` or `extension_id`, `data` schema description, `validation`, `compatibility` per spec **§22.2** in `Relay-Stack-Spec-v1-2.md`).
3. **Open a pull request** that:
   * links the issue (if any);
   * names the file clearly (`log-event.data.<name>.v<n>.json` or `ext.<id>.v<n>.json`);
   * does **not** change **Appendix B** normative text (that is done only in a spec release).
4. **Review criteria**
   * **Schema:** fields, types, and semantics are unambiguous; uses RFC 3339 for times where applicable (**§4.1.1.1**).
   * **Validation:** implementable rules (required keys, cross-field constraints).
   * **Compatibility:** what older readers do with newer `data` (ignore vs reject) and what newer code does with older payloads.
   * **No silent incompatibility** with the spirit of **§10.2** (same `type` should not get incompatible `data` under the same registry version without a version bump or new filename).

## Versioning

* **File version** (`v1`, `v2` in the filename) indicates **breaking** changes to the registered `data` or extension.
* **document_version** inside the JSON (semver-style) is for **iterative** draft clarifications of the same file version.

## Escalation to the spec

If a `data` shape should become **normative in Appendix B** in a future **Relay v1.x** release, the **markdown spec** must be updated in the same org/repo; the registry entry remains the **staging** or **supplement** until a spec version ships.
