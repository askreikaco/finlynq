/**
 * Family Wealth ECIES and section key crypto.
 *
 * Primitives (Node crypto only, no hand-rolled curve/AEAD code):
 * - generateKeypair(): X25519 keypair (public = SPKI DER hex, private = PKCS8 DER hex)
 * - generateSectionKey(): random 32-byte section key
 * - sealKey / unsealKey: ECIES = ephemeral X25519 ECDH -> HKDF-SHA256 -> AES-256-GCM
 * - encryptLabel / decryptLabel: AES-256-GCM under a section key, AAD-bound
 * - wrapSecretWithDEK / unwrapSecretWithDEK: DEK-wrapping of keys, AAD-bound
 *
 * Seal wire format (base64): 0x01 || ephPub(32 raw) || iv(12) || ct(32) || tag(16)
 *   - fresh ephemeral X25519 key and fresh random 96-bit IV per seal
 *   - HKDF salt/info are domain separated and include BOTH public keys (ephemeral + recipient)
 *   - AAD is caller-supplied and mandatory (see buildGrantAAD: JSON array, unambiguous)
 *
 * Private keys are never logged. Error messages never include key material.
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPublicKey,
  createPrivateKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  timingSafeEqual,
  type KeyObject,
} from "crypto";

const IV_LEN = 12; // AES-GCM standard
const TAG_LEN = 16;
const KEY_LEN = 32; // AES-256
const X25519_PUB_LEN = 32;
const SEAL_VERSION = 0x01;
const SEAL_LEN = 1 + X25519_PUB_LEN + IV_LEN + KEY_LEN + TAG_LEN;
// DER prefix of an X25519 SubjectPublicKeyInfo (followed by the 32 raw bytes).
const X25519_SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

const SEAL_SALT = Buffer.from("finlynq-family-seal-v1:salt", "utf8");
const SEAL_INFO_LABEL = Buffer.from("finlynq-family-seal-v1:key", "utf8");
const SRCHASH_INFO = Buffer.from("finlynq-family-srchash-v1", "utf8");

/** Generate an X25519 keypair (public SPKI DER hex shareable; private PKCS8 DER hex must be wrapped). */
export function generateKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("hex"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("hex"),
  };
}

/** Generate a random 32-byte section key. */
export function generateSectionKey(): Buffer {
  return randomBytes(KEY_LEN);
}

/**
 * Canonical (unambiguous) AAD for a key grant: JSON array, so no component can
 * smuggle a delimiter. Domain separated from every other AAD in this module.
 */
export function buildGrantAAD(
  shareId: string,
  ownerId: string,
  viewerId: string,
  section: string,
  epoch: number,
): string {
  return JSON.stringify(["finlynq-family-grant-v1", shareId, ownerId, viewerId, section, epoch]);
}

/** Canonical AAD for a sidecar label row. */
export function buildLabelAAD(
  ownerId: string,
  section: string,
  entityType: string,
  entityId: number | string,
  epoch: number,
): string {
  return JSON.stringify(["finlynq-family-label-v1", ownerId, section, entityType, String(entityId), epoch]);
}

/** Canonical AAD for DEK-wrapped family secrets (private key, section key). */
export function buildWrapAAD(kind: "priv" | "section-key", ...parts: Array<string | number>): string {
  return JSON.stringify(["finlynq-family-wrap-v1", kind, ...parts.map(String)]);
}

function requireAad(aad: string): Buffer {
  if (typeof aad !== "string" || aad.length === 0) {
    throw new Error("AAD is required");
  }
  return Buffer.from(aad, "utf8");
}

function rawPublicFromKey(pub: KeyObject): Buffer {
  const der = pub.export({ type: "spki", format: "der" }) as Buffer;
  if (der.length !== X25519_SPKI_PREFIX.length + X25519_PUB_LEN) throw new Error("Invalid X25519 public key");
  return Buffer.from(der.subarray(X25519_SPKI_PREFIX.length));
}

function publicKeyFromRaw(raw: Buffer): KeyObject {
  return createPublicKey({ key: Buffer.concat([X25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
}

function importX25519Public(hex: string): KeyObject {
  const key = createPublicKey({ key: Buffer.from(hex, "hex"), format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "x25519") throw new Error("Not an X25519 public key");
  return key;
}

function importX25519Private(hex: string): KeyObject {
  const key = createPrivateKey({ key: Buffer.from(hex, "hex"), format: "der", type: "pkcs8" });
  if (key.asymmetricKeyType !== "x25519") throw new Error("Not an X25519 private key");
  return key;
}

/** ECDH + HKDF -> 32-byte AES key. Zeroes the raw shared secret. */
function deriveSealKey(privateKey: KeyObject, peerPublic: KeyObject, ephRaw: Buffer, recipientRaw: Buffer): Buffer {
  const shared = diffieHellman({ privateKey, publicKey: peerPublic });
  try {
    // Reject low-order/contributory-failure points (all-zero shared secret).
    if (timingSafeEqual(shared, Buffer.alloc(shared.length))) {
      throw new Error("Invalid ECDH shared secret");
    }
    const info = Buffer.concat([SEAL_INFO_LABEL, ephRaw, recipientRaw]);
    return Buffer.from(hkdfSync("sha256", shared, SEAL_SALT, info, KEY_LEN));
  } finally {
    shared.fill(0);
  }
}

/**
 * Seal a section key to a viewer via ECIES (X25519 + HKDF-SHA256 + AES-256-GCM).
 * Output: base64(version || ephemeral_pub || iv || ciphertext || tag).
 */
export function sealKey(sectionKey: Buffer, viewerPublicKeyHex: string, aad: string): string {
  if (sectionKey.length !== KEY_LEN) {
    throw new Error(`sectionKey must be ${KEY_LEN} bytes`);
  }
  const aadBuf = requireAad(aad);

  const viewerPub = importX25519Public(viewerPublicKeyHex);
  const viewerRaw = rawPublicFromKey(viewerPub);

  // Fresh ephemeral key per seal.
  const { publicKey: ephPub, privateKey: ephPriv } = generateKeyPairSync("x25519");
  const ephRaw = rawPublicFromKey(ephPub);

  const aesKey = deriveSealKey(ephPriv, viewerPub, ephRaw, viewerRaw);
  try {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", aesKey, iv, { authTagLength: TAG_LEN });
    cipher.setAAD(aadBuf);
    const ct = Buffer.concat([cipher.update(sectionKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from([SEAL_VERSION]), ephRaw, iv, ct, tag]).toString("base64");
  } finally {
    aesKey.fill(0);
  }
}

/**
 * Unseal a section key. Throws on any malformed input, wrong key or AAD mismatch.
 */
export function unsealKey(sealedKeyB64: string, viewerPrivateKeyHex: string, aad: string): Buffer {
  const aadBuf = requireAad(aad);
  const sealed = Buffer.from(sealedKeyB64, "base64");
  if (sealed.length !== SEAL_LEN || sealed[0] !== SEAL_VERSION) {
    throw new Error("Malformed sealed key");
  }
  let off = 1;
  const ephRaw = sealed.subarray(off, (off += X25519_PUB_LEN));
  const iv = sealed.subarray(off, (off += IV_LEN));
  const ct = sealed.subarray(off, (off += KEY_LEN));
  const tag = sealed.subarray(off, off + TAG_LEN);

  const viewerPriv = importX25519Private(viewerPrivateKeyHex);
  const viewerRaw = rawPublicFromKey(createPublicKey(viewerPriv));
  const ephPub = publicKeyFromRaw(Buffer.from(ephRaw));

  const aesKey = deriveSealKey(viewerPriv, ephPub, Buffer.from(ephRaw), viewerRaw);
  try {
    const decipher = createDecipheriv("aes-256-gcm", aesKey, iv, { authTagLength: TAG_LEN });
    decipher.setAAD(aadBuf);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } finally {
    aesKey.fill(0);
  }
}

/** Encrypt a label for the family_labels sidecar. Output: base64(iv || ct || tag). */
export function encryptLabel(sectionKey: Buffer, label: string, aad: string): string {
  if (sectionKey.length !== KEY_LEN) {
    throw new Error(`sectionKey must be ${KEY_LEN} bytes`);
  }
  const aadBuf = requireAad(aad);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", sectionKey, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(aadBuf);
  const ct = Buffer.concat([cipher.update(label, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

/** Decrypt a sidecar label. Throws on wrong key, wrong AAD or tampering. */
export function decryptLabel(sectionKey: Buffer, labelCtB64: string, aad: string): string {
  if (sectionKey.length !== KEY_LEN) {
    throw new Error(`sectionKey must be ${KEY_LEN} bytes`);
  }
  const aadBuf = requireAad(aad);
  const encrypted = Buffer.from(labelCtB64, "base64");
  if (encrypted.length < IV_LEN + TAG_LEN) throw new Error("Malformed label ciphertext");
  const iv = encrypted.subarray(0, IV_LEN);
  const tag = encrypted.subarray(encrypted.length - TAG_LEN);
  const ct = encrypted.subarray(IV_LEN, encrypted.length - TAG_LEN);

  const decipher = createDecipheriv("aes-256-gcm", sectionKey, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(aadBuf);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * HMAC-SHA256 of a source ciphertext for src_hash (skip-on-unchanged).
 * Uses an HKDF-derived subkey so the section key is never used directly as an HMAC key.
 */
export function hashLabel(key: Buffer, labelCiphertext: string): string {
  const macKey = Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), SRCHASH_INFO, KEY_LEN));
  try {
    return createHmac("sha256", macKey).update(labelCiphertext, "utf8").digest("base64");
  } finally {
    macKey.fill(0);
  }
}

/** Constant-time string equality (for hashes / tokens). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Wrap arbitrary secret bytes under a DEK (v1:iv:ct:tag, same shape as encryptField).
 * Pass an AAD to bind the wrap to its row (prevents swapping wrapped keys between rows).
 */
export function wrapSecretWithDEK(dek: Buffer, secret: Buffer, aad?: string): string {
  if (dek.length !== KEY_LEN) {
    throw new Error(`dek must be ${KEY_LEN} bytes`);
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", dek, iv, { authTagLength: TAG_LEN });
  if (aad !== undefined) cipher.setAAD(requireAad(aad));
  const ct = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

/** Unwrap bytes wrapped with wrapSecretWithDEK (same AAD required). */
export function unwrapSecretWithDEK(dek: Buffer, wrapped: string, aad?: string): Buffer {
  if (dek.length !== KEY_LEN) {
    throw new Error(`dek must be ${KEY_LEN} bytes`);
  }
  if (!wrapped.startsWith("v1:")) {
    throw new Error("Wrapped key must start with v1:");
  }
  const parts = wrapped.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed wrapped key");
  }
  const iv = Buffer.from(parts[1], "base64");
  const ct = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  if (iv.length !== IV_LEN) throw new Error("Invalid IV length");
  if (tag.length !== TAG_LEN) throw new Error("Invalid tag length");

  const decipher = createDecipheriv("aes-256-gcm", dek, iv, { authTagLength: TAG_LEN });
  if (aad !== undefined) decipher.setAAD(requireAad(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Wrap a 32-byte key under a DEK. */
export function wrapKeyWithDEK(dek: Buffer, key: Buffer, aad?: string): string {
  if (key.length !== KEY_LEN) {
    throw new Error(`key must be ${KEY_LEN} bytes`);
  }
  return wrapSecretWithDEK(dek, key, aad);
}

/** Unwrap a 32-byte key previously wrapped with wrapKeyWithDEK. */
export function unwrapKeyWithDEK(dek: Buffer, wrapped: string, aad?: string): Buffer {
  const plaintext = unwrapSecretWithDEK(dek, wrapped, aad);
  if (plaintext.length !== KEY_LEN) {
    plaintext.fill(0);
    throw new Error(`Unwrapped key is ${plaintext.length} bytes, expected ${KEY_LEN}`);
  }
  return plaintext;
}
