#!/usr/bin/env node
/**
 * One command: main origin :3001 + shared relay :3002 + indexer :3003 + web :5173,
 * and second origin :3004 (relay_mvp_b) + web :5174 (peer proxy).
 * Loads relay-mvp/.env. Does not re-seed node A; migrates+seeds B if you run with PREP=1.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadDotenv() {
  const p = path.join(root, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

loadDotenv();

const defaultDb = "postgres://relay:relay@127.0.0.1:5432/relay_mvp";
const urlA = process.env.DATABASE_URL || defaultDb;
const u = new URL(urlA);
u.pathname = "/relay_mvp_b";
const databaseUrlB = u.href;

const child = spawn("bash", [path.join(__dirname, "dev-full.sh"), databaseUrlB], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: urlA,
    DATABASE_URL_B: databaseUrlB,
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
