/**
 * Server-key envelope for system settings (email transport, integrations).
 *
 * AES-256-GCM with a key HKDF-derived from the existing server secret
 * PF_STAGING_KEY (required >=32 chars in prod; see docker-compose.yml). The
 * HKDF `info` label domain-separates it from staging-envelope.ts, which uses
 * the same secret. The setting's key name is bound as GCM AAD so a ciphertext
 * cannot be swapped between rows. Never a user DEK.
 *
 * Threat model: DB-dump-only attacker. Not a server admin (env + DB + process).
 *
 * No plaintext fallback: without PF_STAGING_KEY encrypt() THROWS (a secret must
 * never be stored in the clear) and decrypt() THROWS (callers warn + fall back).
 */

import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from "crypto";

const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const MARKER = "ss1:";
const HKDF_INFO = "finlynq/system-settings/v1";
const HKDF_SALT = "finlynq-system-settings";

function deriveKey(): Buffer {
  const raw = process.env.PF_STAGING_KEY;
  if (!raw || raw.length < 32) {
    throw new Error("PF_STAGING_KEY (>=32 chars) is required for system settings");
  }
  return Buffer.from(hkdfSync("sha256", raw, HKDF_SALT, HKDF_INFO, KEY_LEN));
}

/** Encrypt `value` for storage under `name`. Returns `ss1:<b64(iv|tag|ct)>`. */
export function encryptSystemSetting(name: string, value: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return MARKER + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Decrypt a stored value for `name`. Throws on missing key, bad marker, tamper, wrong row. */
export function decryptSystemSetting(name: string, stored: string): string {
  if (!stored.startsWith(MARKER)) throw new Error("system setting is not an ss1 envelope");
  const key = deriveKey();
  const buf = Buffer.from(stored.slice(MARKER.length), "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("malformed system setting ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, IV_LEN));
  decipher.setAAD(Buffer.from(name, "utf8"));
  decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString("utf8");
}
