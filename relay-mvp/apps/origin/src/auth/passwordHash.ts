import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;
const VERSION = 1;

/**
 * Storable `scrypt$v1$...` string (salt and hash are base64url).
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(Buffer.from(plain, "utf8"), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt$v${VERSION}$N=${SCRYPT_N}$r=${SCRYPT_r}$p=${SCRYPT_p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

/**
 * @returns true if the password matches the stored `hash`
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored?.startsWith("scrypt$v")) return false;
  const parts = stored.split("$");
  if (parts.length < 6) return false;
  if (parts[0] !== "scrypt" || parts[1] !== "v1") return false;
  const N = Number(parts[2]?.split("=")[1]);
  const r = Number(parts[3]?.split("=")[1]);
  const p = Number(parts[4]?.split("=")[1]);
  if (!N || !r || !p) return false;
  const saltB64 = parts[5];
  const wantB64 = parts[6];
  if (!saltB64 || !wantB64) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const want = Buffer.from(wantB64, "base64url");
  const got = await scryptAsync(Buffer.from(plain, "utf8"), salt, want.length, {
    N,
    r,
    p,
  });
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}
