import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const _dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(_dir, "../../../.env") });

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://relay:relay@localhost:5432/relay_mvp",
});
