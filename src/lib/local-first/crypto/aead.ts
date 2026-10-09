/**
 * AES-GCM-256 AEAD over WebCrypto (`crypto.subtle`). Same code in Node 22 and browsers.
 * PROTOTYPE, unreviewed. Not wired into any live path.
 *
 * Sealed layout (single Uint8Array), D5 = random 96-bit nonce per call, no counter:
 *
 *   offset 0            12 bytes   nonce (random)
 *   offset 12           n bytes    ciphertext (same length as plaintext)
 *   offset 12 + n       16 bytes   GCM tag (128-bit)
 *
 * Total length = 12 + n + 16. WebCrypto returns ciphertext||tag; the nonce is prepended.
 * The AAD is NOT stored in the output; the caller must supply the identical AAD to open().
 */

export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const MIN_SEALED_BYTES = NONCE_BYTES + TAG_BYTES;

/** Thrown on any authentication/decryption failure. Message is fixed and carries no detail. */
export class AuthError extends Error {
  constructor() {
    super("authentication failed");
    this.name = "AuthError";
  }
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto crypto.subtle is not available");
  return s;
}

/** Encrypt. Fresh random 96-bit nonce on every call. */
export async function seal(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const nonce = new Uint8Array(NONCE_BYTES);
  globalThis.crypto.getRandomValues(nonce);
  const params: AesGcmParams = { name: "AES-GCM", iv: nonce, tagLength: TAG_BYTES * 8 };
  if (aad !== undefined) params.additionalData = aad as BufferSource;
  const ctAndTag = new Uint8Array(
    await subtle().encrypt(params, key, plaintext as BufferSource),
  );
  const out = new Uint8Array(NONCE_BYTES + ctAndTag.length);
  out.set(nonce, 0);
  out.set(ctAndTag, NONCE_BYTES);
  return out;
}

/** Decrypt. Any failure (short input, wrong key, tampered nonce/ct/tag, wrong AAD) throws AuthError. */
export async function open(
  key: CryptoKey,
  sealed: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  if (sealed.length < MIN_SEALED_BYTES) throw new AuthError();
  const nonce = sealed.subarray(0, NONCE_BYTES);
  const ctAndTag = sealed.subarray(NONCE_BYTES);
  const params: AesGcmParams = { name: "AES-GCM", iv: nonce as BufferSource, tagLength: TAG_BYTES * 8 };
  if (aad !== undefined) params.additionalData = aad as BufferSource;
  try {
    return new Uint8Array(await subtle().decrypt(params, key, ctAndTag as BufferSource));
  } catch {
    throw new AuthError();
  }
}
