/**
 * Second seal layer for the on-device offline data while passkey unlock is enrolled (local-first). PROTOTYPE, unreviewed.
 *
 * Envelope per record (outbox record and snapshot blob alike):
 *   single (no passkey record)   E1 = seal(deviceKey, plain, aad)
 *   double (passkey record)      E2 = seal(deviceKey, seal(innerKey, plain, aad), aad)
 *
 * innerKey = HKDF-SHA-256(ikm = unlock secret, salt = empty, info = "finlynq-lf-passkey-inner-v1|<store>|<userId>"),
 *   AES-GCM-256, non-extractable. store = "outbox" | "snapshot". The unlock secret exists only in page memory after a
 *   passkey ceremony, so reading E2 needs the device key AND the ceremony.
 * aad = the caller's AAD (the same for both layers). seal() = nonce(12) || ciphertext || tag(16).
 *
 * How a reader knows the layer count:
 *   outbox:   the IndexedDB value is a bare Uint8Array (E1) or { f: 2, c: E2 } (see outbox-store.ts).
 *   snapshot: the plaintext pointer in the META store carries layers: 2 (absent = 1). See persist-store.ts.
 */
import { seal, open } from "./aead";
import { PasskeyLockedError, readPasskeyUnlockRecord, unlockSecretFor, type PasskeyUnlockRecord } from "./passkey-unlock";

export const INNER_INFO_PREFIX = "finlynq-lf-passkey-inner-v1";
export type SealStore = "outbox" | "snapshot";

const enc = new TextEncoder();

export function innerInfo(store: SealStore, userId: string): Uint8Array {
  return enc.encode(`${INNER_INFO_PREFIX}|${store}|${userId}`);
}

/** HKDF-SHA-256 from the unlock secret to a non-extractable AES-GCM-256 inner key. */
export async function deriveInnerKey(secret: Uint8Array, store: SealStore, userId: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const ikm = await subtle.importKey("raw", secret as BufferSource, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0) as BufferSource, info: innerInfo(store, userId) as BufferSource },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * The inner key to use for `store` right now.
 * - null: no passkey record, so single seal only.
 * - CryptoKey: a record exists and this page holds its unlock secret.
 * - throws PasskeyLockedError: a record exists (or cannot be read: fail closed) and there is no unlock secret here.
 */
export async function innerKeyFor(userId: string, store: SealStore): Promise<CryptoKey | null> {
  let rec: PasskeyUnlockRecord | null;
  try {
    rec = await readPasskeyUnlockRecord(userId);
  } catch {
    throw new PasskeyLockedError();
  }
  if (!rec) return null;
  const secret = unlockSecretFor(userId);
  if (!secret) throw new PasskeyLockedError();
  return deriveInnerKey(secret, store, userId);
}

/** Seals `plain`: E2 when `inner` is set, else E1. */
export async function sealLayers(outer: CryptoKey, inner: CryptoKey | null, plain: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  if (!inner) return seal(outer, plain, aad);
  return seal(outer, await seal(inner, plain, aad), aad);
}

/**
 * Opens a sealed value with `layers` (1 or 2). layers 2 needs `inner`; without it the call throws PasskeyLockedError.
 * Any authentication failure throws AuthError (from aead.open).
 */
export async function openLayers(outer: CryptoKey, inner: CryptoKey | null, sealed: Uint8Array, aad: Uint8Array, layers: 1 | 2): Promise<Uint8Array> {
  const body = await open(outer, sealed, aad);
  if (layers === 1) return body;
  if (!inner) throw new PasskeyLockedError();
  return open(inner, body, aad);
}
