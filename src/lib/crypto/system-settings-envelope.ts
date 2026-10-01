/**
 * Server-key envelope for system settings (email transport, integrations, etc).
 *
 * Encrypts at rest with AES-256-GCM using a server-derived key. The key is
 * derived from an existing server secret (e.g., PF_STAGING_KEY) using HKDF
 * with a domain-specific label to prevent key reuse across contexts.
 *
 * Threat model: protects against DB-only attacks (who don't have env vars).
 * Does NOT protect against server admins (who have env + DB + process).
 * Matches the boundary of password-envelope peppers — encryption at rest.
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
} from "crypto";

const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const MARKER = "ss1:";

let settingsWarned = false;

/**
 * Derive a system-settings-specific key from the server secret using HKDF.
 * This prevents key reuse if the same secret is used for multiple purposes.
 */
function deriveSystemSettingsKey(): Buffer | null {
  const raw = process.env.PF_STAGING_KEY;
  if (raw && raw.length >= 32) {
    // Use HKDF to derive a domain-separated key
    // Info string prevents the key from being reused in other contexts
    const info = Buffer.from("system-settings-v1", "utf8");
    const salt = Buffer.alloc(0);
    return hkdfSync("sha256", raw, salt, info, KEY_LEN);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PF_STAGING_KEY env var is required in production (≥32 chars) for system settings. " +
        "Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  if (!settingsWarned) {
    console.warn(
      "[system-settings-envelope] PF_STAGING_KEY not set — settings will store plaintext. " +
        "DO NOT deploy to production without setting it."
    );
    settingsWarned = true;
  }
  return null;
}

/**
 * Encrypt a setting value. Returns `ss1:<b64>` or the original value if
 * the service key is unset (dev fallback).
 */
export function encryptSystemSetting(value: string | null | undefined): string | null {
  if (value == null) return null;
  const key = deriveSystemSettingsKey();
  if (!key) return value; // dev fallback

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return MARKER + Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypt a setting value. Returns plaintext if the value lacks the marker
 * (legacy or non-encrypted values).
 */
export function decryptSystemSetting(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(MARKER)) return value; // legacy plaintext

  const key = deriveSystemSettingsKey();
  if (!key) {
    throw new Error("Cannot decrypt system setting: PF_STAGING_KEY missing");
  }

  try {
    const buf = Buffer.from(value.slice(MARKER.length), "base64");
    if (buf.length < IV_LEN + TAG_LEN) {
      throw new Error("Malformed system setting ciphertext");
    }

    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (e) {
    throw new Error(
      `Failed to decrypt system setting: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
