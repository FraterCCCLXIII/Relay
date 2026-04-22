/**
 * E2E channel key wrap (MVP): P-256 ECDH + AES-GCM. Origin stores only `wrapped_key_b64` from
 * `PUT /channels/:id/e2e-wrapped-key`. Plaintext channel keys never leave the client.
 */
const AES = "AES-GCM";

function getSubtle() {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!s) throw new Error("Web Crypto required (https context)");
  return s;
}

function rand(n: number): Uint8Array {
  const b = new Uint8Array(n);
  (globalThis as { crypto?: Crypto }).crypto?.getRandomValues(b);
  return b;
}

export async function generateChannelSecretKeyBytes(): Promise<Uint8Array> {
  return rand(32);
}

export async function generateEcdhP256KeyPair(): Promise<CryptoKeyPair> {
  return getSubtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
}

export async function exportEcdhPublicKeySpkiB64(key: CryptoKey): Promise<string> {
  const b = new Uint8Array(await getSubtle().exportKey("spki", key));
  return btoa(String.fromCharCode(...b));
}

async function importPeerSpk(peerPublicKeyBase64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(peerPublicKeyBase64), (c) => c.charCodeAt(0));
  return getSubtle().importKey("spki", raw, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

export async function wrapChannelKeyForPeer(params: {
  channelSecret: Uint8Array;
  ownPrivateEcdh: CryptoKey;
  peerPublicKeySpkiB64: string;
}): Promise<Uint8Array> {
  const peerPub = await importPeerSpk(params.peerPublicKeySpkiB64);
  const sharedBits = new Uint8Array(
    await getSubtle().deriveBits({ name: "ECDH", public: peerPub }, params.ownPrivateEcdh, 256),
  );
  const aes = await getSubtle().importKey("raw", sharedBits, { name: AES, length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const iv = rand(12);
  const plain = new Uint8Array(params.channelSecret);
  const enc = await getSubtle().encrypt(
    { name: AES, iv: new Uint8Array(iv), tagLength: 128 },
    aes,
    new Uint8Array(plain) as globalThis.BufferSource,
  );
  const ct = new Uint8Array(enc);
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function unwrapChannelKeyForSelf(params: {
  wrapped: Uint8Array;
  ownPrivateEcdh: CryptoKey;
  peerPublicKeySpkiB64: string;
}): Promise<Uint8Array> {
  const peerPub = await importPeerSpk(params.peerPublicKeySpkiB64);
  const sharedBits = new Uint8Array(
    await getSubtle().deriveBits({ name: "ECDH", public: peerPub }, params.ownPrivateEcdh, 256),
  );
  const aes = await getSubtle().importKey("raw", sharedBits, { name: AES, length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const iv = params.wrapped.subarray(0, 12);
  const ct = params.wrapped.subarray(12);
  const plainBuf = await getSubtle().decrypt(
    { name: AES, iv: new Uint8Array(iv), tagLength: 128 },
    aes,
    new Uint8Array(ct) as globalThis.BufferSource,
  );
  return new Uint8Array(plainBuf);
}
