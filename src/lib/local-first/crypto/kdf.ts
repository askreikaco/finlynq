/**
 * Key derivation: passphrase -> Argon2id (root) -> HKDF-SHA256 -> two NON-EXTRACTABLE
 * AES-GCM-256 CryptoKeys (oplog, snapshot). PROTOTYPE, unreviewed.
 *
 * Note: @noble/hashes 2.2.0 argon2id has no `ad` option. The `personalization` option maps to the
 * RFC 9106 associated-data (AD) slot, so `associatedData` below is passed as `personalization`.
 */
import { argon2id } from "@noble/hashes/argon2.js";

export interface Argon2Params {
  /** memory in KiB */
  m: number;
  /** iterations */
  t: number;
  /** parallelism */
  p: number;
  /** output length in bytes */
  dkLen: number;
}

/** D2 default parameter set A (DEFAULT-PENDING-OWNER). */
export const ARGON2_SET_A: Readonly<Argon2Params> = Object.freeze({
  m: 19456,
  t: 2,
  p: 1,
  dkLen: 32,
});

export const HKDF_INFO_OPLOG = "finlynq/lf/oplog/v1";
export const HKDF_INFO_SNAPSHOT = "finlynq/lf/snapshot/v1";

export interface LogKeys {
  oplogKey: CryptoKey;
  snapshotKey: CryptoKey;
}

const enc = new TextEncoder();

/** Argon2id root key material. Caller should zero the result when done. */
export function deriveRootKey(
  passphrase: string,
  salt: Uint8Array,
  params: Argon2Params = ARGON2_SET_A,
  associatedData?: Uint8Array,
): Uint8Array {
  if (passphrase.length === 0) throw new Error("passphrase must not be empty");
  if (salt.length < 16) throw new Error("salt must be at least 16 bytes");
  return argon2id(enc.encode(passphrase), salt, {
    m: params.m,
    t: params.t,
    p: params.p,
    dkLen: params.dkLen,
    ...(associatedData ? { personalization: associatedData } : {}),
  });
}

/** HKDF-SHA256 (salt = logId) from root bytes to two non-extractable AES-GCM-256 keys. */
export async function deriveLogKeys(root: Uint8Array, logId: string): Promise<LogKeys> {
  if (logId.length === 0) throw new Error("logId must not be empty");
  const subtle = globalThis.crypto.subtle;
  const hkdfKey = await subtle.importKey("raw", root as BufferSource, "HKDF", false, ["deriveKey"]);
  const salt = enc.encode(logId);
  const derive = (info: string) =>
    subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info: enc.encode(info) },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      false, // non-extractable
      ["encrypt", "decrypt"],
    );
  const [oplogKey, snapshotKey] = await Promise.all([
    derive(HKDF_INFO_OPLOG),
    derive(HKDF_INFO_SNAPSHOT),
  ]);
  return { oplogKey, snapshotKey };
}

/** Passphrase -> Argon2id -> HKDF. Zeroes the root bytes before returning. */
export async function deriveKeysFromPassphrase(
  passphrase: string,
  kdfSalt: Uint8Array,
  logId: string,
  params: Argon2Params = ARGON2_SET_A,
  associatedData?: Uint8Array,
): Promise<LogKeys> {
  const root = deriveRootKey(passphrase, kdfSalt, params, associatedData);
  try {
    return await deriveLogKeys(root, logId);
  } finally {
    root.fill(0);
  }
}
