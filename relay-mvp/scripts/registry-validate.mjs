#!/usr/bin/env node
/**
 * Validate registry log-event `data_schema` objects as JSON Schemas.
 * Usage: node scripts/registry-validate.mjs [path-to-registry-dir]
 * Default: ../../registry (monorepo root) when run from relay-mvp.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRegistry = resolve(__dirname, "../../registry");
const root = process.argv[2] ? resolve(process.argv[2]) : defaultRegistry;

const ajv = new Ajv({ allErrors: true, strict: false });
let errors = 0;
let files;
try {
  files = (await readdir(root)).filter((f) => f.startsWith("log-event.data.") && f.endsWith(".json"));
} catch (e) {
  console.error("Cannot read registry dir:", root, e instanceof Error ? e.message : e);
  process.exit(1);
}

if (files.length === 0) {
  console.error("No log-event.data.*.json in", root);
  process.exit(1);
}

for (const f of files.sort()) {
  const p = join(root, f);
  let doc;
  try {
    doc = JSON.parse(await readFile(p, "utf8"));
  } catch (e) {
    console.error(f, "parse error:", e instanceof Error ? e.message : e);
    errors++;
    continue;
  }
  if (doc.kind !== "log_event_data") {
    console.error(f, "expected kind: log_event_data");
    errors++;
  }
  if (!doc.log_event_type || typeof doc.log_event_type !== "string") {
    console.error(f, "missing log_event_type");
    errors++;
  }
  if (!doc.data_schema || typeof doc.data_schema !== "object") {
    console.error(f, "missing data_schema");
    errors++;
    continue;
  }
  try {
    ajv.compile(doc.data_schema);
  } catch (e) {
    console.error(f, "invalid data_schema JSON Schema:", e instanceof Error ? e.message : e);
    errors++;
    continue;
  }
  const required = Array.isArray(doc.data_schema.required) ? doc.data_schema.required : [];
  const sample = {};
  for (const r of required) {
    if (r === "channel_id") sample[r] = "relay:channel:demo";
    else if (r === "member_actor") sample[r] = "relay:actor:demo";
    else if (r === "object_id") sample[r] = "post:demo:1";
    else if (r === "version") sample[r] = 1;
    else if (r === "reason") sample[r] = "rotate";
    else if (r === "previous_object_id") sample[r] = "post:old:1";
    else if (r === "next_object_id") sample[r] = "post:new:1";
    else if (r === "subject_actor_id") sample[r] = "relay:actor:subj";
    else if (r === "issuer_actor_id") sample[r] = "relay:actor:iss";
    else if (r === "level") sample[r] = "standard";
    else if (r === "scope") sample[r] = "channel:demo";
    else if (r === "evidence_uri") sample[r] = "https://example.com/e";
    else sample[r] = "x";
  }
  const validate = ajv.compile(doc.data_schema);
  if (!validate(sample)) {
    console.warn(f, "warning: pluggable sample may need tuning:", validate.errors);
  }
  console.log("ok", f, "type", doc.log_event_type);
}

if (errors) {
  console.error("Failed with", errors, "errors");
  process.exit(1);
}
console.log("All", files.length, "registry data_schema files are valid JSON Schemas.");
