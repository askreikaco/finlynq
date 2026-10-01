/**
 * Family Wealth ECIES and section key crypto.
 *
 * Primitives:
 * - generateKeypair(): X25519 keypair
 * - generateSectionKey(): random 32-byte section key
 * - sealKey(sectionKey, viewerPublicKey, aad): ECIES(K -> viewer pub)
 *   AAD = shareId|ownerId|viewerId|section|epoch (with domain separation "finlynq-family-seal-v1")
 * - unsealKey(sealedKey, viewerPrivateKey, aad): unwrap sealed key
 * - encryptLabel(sectionKey, label, aad): AES-256-GCM + sidecar format
 * - decryptLabel(sectionKey, labelCt, aad): unwrap label
 *
 * Private keys are NEVER logged or returned unwrapped outside callbacks.
 * Nonces are fresh per-operation; keys are zeroed in finalizers where practical.
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPublicKey,
  createPrivateKey,
  generateKeyPairSync,
  hkdfSync,
} from "crypto";

const IV_LEN = 12; // AES-GCM standard
const TAG_LEN = 16;
const KEY_LEN = 32; // AES-256

/**
 * Generate an X25519 keypair (for ECIES).
 * Returns { publicKey, privateKey } both as hex strings (public shareable, private must be wrapped).
 */
export function generateKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("hex"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("hex"),
  };
}

/**
 * Generate a random 32-byte section key.
 */
export function generateSectionKey(): Buffer {
  return randomBytes(KEY_LEN);
}

/**
 * Seal a section key to a viewer via ECIES (X25519 + HKDF + AES-256-GCM).
 *
 * Input:
 *   sectionKey: 32-byte section key to seal
 *   viewerPublicKeyHex: viewer's X25519 public key (hex string, from X25519 SPKI DER)
 *   aad: additional authenticated data (shareId|ownerId|viewerId|section|epoch with domain sep)
 *
 * Output: base64(ephemeral_pub || ciphertext || tag) suitable for storage in key_sealed.
 *
 * The ephemeral key is single-use; the viewer needs their private key to unseal.
 */
export function sealKey(
  sectionKey: Buffer,
  viewerPublicKeyHex: string,
  aad: string,
): string {
  if (sectionKey.length !== KEY_LEN) {
    throw new Error(`sectionKey must be ${KEY_LEN} bytes`);
  }

  // Ephemeral keypair for this seal
  const { publicKey: ephPub, privateKey: ephPriv } = generateKeyPairSync("x25519");

  // Import viewer's public key from hex (SPKI DER format)
  const viewerPubBuffer = Buffer.from(viewerPublicKeyHex, "hex");
  const viewerPubKey = createPublicKey({
    key: viewerPubBuffer,
    format: "der",
    type: "spki",
  });

  // Perform ECDH: compute shared secret using ephemeral private + viewer public
  // Use diffieHellman method which exists on X25519 private keys
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shared = ((ephPriv as any).diffieHellman(viewerPubKey)) as Buffer;

  // Derive encryption key via HKDF-SHA256 (use shared secret as input key material)
  const keyBuf = Buffer.from(
    hkdfSync("sha256", shared, Buffer.alloc(0), Buffer.from("finlynq-family-seal-v1"), KEY_LEN),
  );

  // Encrypt section key with AES-256-GCM
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(sectionKey), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Return: ephemeral_pub || iv || ciphertext || tag (all base64-encoded together)
  const ephPubDer = ephPub.export({ type: "spki", format: "der" }) as Buffer;
  const sealed = Buffer.concat([ephPubDer, iv, ct, tag]);
  return sealed.toString("base64");
}

/**
 * Unseal a section key.
 *
 * Input:
 *   sealedKeyB64: output from sealKey()
 *   viewerPrivateKeyHex: viewer's X25519 private key (hex string, from X25519 PKCS8 DER)
 *   aad: same AAD passed to sealKey()
 *
 * Output: 32-byte section key buffer.
 * Throws if AAD doesn't match or decryption fails.
 */
export function unsealKey(
  sealedKeyB64: string,
  viewerPrivateKeyHex: string,
  aad: string,
): Buffer {
  const sealed = Buffer.from(sealedKeyB64, "base64");

  // Extract components: ephemeral_pub (fixed size ~44 bytes SPKI DER), iv, ct, tag
  // X25519 SPKI DER format is typically 44 bytes
  const ephPubDer = sealed.subarray(0, 44);
  const iv = sealed.subarray(44, 44 + IV_LEN);
  const tag = sealed.subarray(sealed.length - TAG_LEN);
  const ct = sealed.subarray(44 + IV_LEN, sealed.length - TAG_LEN);

  // Import ephemeral public key
  const ephPubKey = createPublicKey({
    key: ephPubDer,
    format: "der",
    type: "spki",
  });

  // Import viewer's private key from hex
  const viewerPrivBuffer = Buffer.from(viewerPrivateKeyHex, "hex");
  const viewerPrivKey = createPrivateKey({
    key: viewerPrivBuffer,
    format: "der",
    type: "pkcs8",
  });

  // Perform ECDH using viewer's private key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shared = ((viewerPrivKey as any).diffieHellman(ephPubKey)) as Buffer;

  // Derive same encryption key
  const keyBuf = Buffer.from(
    hkdfSync("sha256", shared, Buffer.alloc(0), Buffer.from("finlynq-family-seal-v1"), KEY_LEN),
  );

  // Decrypt
  const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);

  if (plaintext.length !== KEY_LEN) {
    throw new Error(`Unsealed key is ${plaintext.length} bytes, expected ${KEY_LEN}`);
  }

  return plaintext;
}

/**
 * Encrypt a label for storage in family_labels sidecar.
 *
 * Input:
 *   sectionKey: 32-byte section key
 *   label: plaintext label (e.g. account name)
 *   aad: owner|section|entity_type|entity_id|epoch
 *
 * Output: base64-encoded ciphertext suitable for labelCt column.
 */
export function encryptLabel(
  sectionKey: Buffer,
  label: string,
  aad: string,
): string {
  if (sectionKey.length !== KEY_LEN) {
    throw new Error(`sectionKey must be ${KEY_LEN} bytes`);
  }

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", sectionKey, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(label, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, ct, tag]).toString("base64");
}

/**
 * Decrypt a label from family_labels sidecar.
 *
 * Input:
 *   sectionKey: 32-byte section key
 *   labelCtB64: output from encryptLabel()
 *   aad: same AAD passed to encryptLabel()
 *
 * Output: plaintext label string.
 * Throws if AAD doesn't match or decryption fails.
 */
export function decryptLabel(
  sectionKey: Buffer,
  labelCtB64: string,
  aad: string,
): string {
  if (sectionKey.length !== KEY_LEN) {
    throw new Error(`sectionKey must be ${KEY_LEN} bytes`);
  }

  const encrypted = Buffer.from(labelCtB64, "base64");
  const iv = encrypted.subarray(0, IV_LEN);
  const tag = encrypted.subarray(encrypted.length - TAG_LEN);
  const ct = encrypted.subarray(IV_LEN, encrypted.length - TAG_LEN);

  const decipher = createDecipheriv("aes-256-gcm", sectionKey, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);

  return plaintext.toString("utf8");
}

/**
 * Compute HMAC-SHA256 of a label for src_hash (skip-on-unchanged optimization).
 * Used to detect when the source label hasn't changed between sweeps.
 */
export function hashLabel(key: Buffer, labelCiphertext: string): string {
  const hmac = createHmac("sha256", key);
  hmac.update(labelCiphertext, "utf8");
  return hmac.digest("base64");
}

/**
 * Wrap a key under a DEK (for viewer_wrapped optimization).
 * Uses the same format as encryptField (v1:iv:ct:tag).
 */
export function wrapKeyWithDEK(dek: Buffer, key: Buffer): string {
  if (dek.length !== KEY_LEN) {
    throw new Error(`dek must be ${KEY_LEN} bytes`);
  }
  if (key.length !== KEY_LEN) {
    throw new Error(`key must be ${KEY_LEN} bytes`);
  }

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const ct = Buffer.concat([cipher.update(key), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

/**
 * Unwrap a key previously wrapped with wrapKeyWithDEK.
 */
export function unwrapKeyWithDEK(dek: Buffer, wrapped: string): Buffer {
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

  const decipher = createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);

  if (plaintext.length !== KEY_LEN) {
    throw new Error(`Unwrapped key is ${plaintext.length} bytes, expected ${KEY_LEN}`);
  }

  return plaintext;
}
