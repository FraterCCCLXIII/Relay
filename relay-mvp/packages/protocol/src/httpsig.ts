/**
 * HTTP message body signing (Stack §19–style minimal profile) — same canonical string on client and origin.
 * Body hash is hex-encoded SHA-256 of the raw request body (empty for no body).
 */
export function buildRelayHttpsigString(method: string, path: string, bodySha256Hex: string): string {
  return `${method.toUpperCase()}\n${path}\n${bodySha256Hex}\n`;
}
