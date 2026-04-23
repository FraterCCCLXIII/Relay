import { bytesToHex } from "@noble/hashes/utils.js";

export function hexToBytes(hex: string): Uint8Array {
  const t = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (t.length % 2 !== 0) throw new Error("invalid hex length");
  const u = new Uint8Array(t.length / 2);
  for (let i = 0; i < u.length; i++) {
    u[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
  }
  return u;
}

export { bytesToHex };
