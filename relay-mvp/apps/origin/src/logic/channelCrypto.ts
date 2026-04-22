import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const pepper = () => process.env.RELAY_MVP_CHANNEL_PEPPER ?? "relay-mvp-dev-channel-pepper";

/** Deterministic 32-byte key per channel (MVP: server holds pepper; not E2E). */
function deriveKey(channelId: string): Buffer {
  return scryptSync(`${pepper()}::${channelId}`, "relay.mvp.channel.v1", 32);
}

export function encryptChannelSecret(plaintext: string, channelId: string): { ciphertext: Buffer; iv: Buffer } {
  const key = deriveKey(channelId);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const out = Buffer.concat([c.update(plaintext, "utf8"), c.final(), c.getAuthTag()]);
  return { ciphertext: out, iv };
}

export function decryptChannelSecret(ciphertext: Buffer, iv: Buffer, channelId: string): string {
  const key = deriveKey(channelId);
  if (ciphertext.length < 17) throw new Error("ciphertext_too_short");
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
