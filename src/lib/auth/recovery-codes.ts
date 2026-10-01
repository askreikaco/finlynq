/**
 * Recovery codes: 10 independent single-use 100-bit secrets that wrap the user's DEK.
 *
 * Format: `XXXXX-XXXXX-XXXXX-XXXXX` (20 base32 chars, A-Z/2-7, uppercase).
 * Canonical storage: `pfrc1:<20 chars>` (domain-separated for authLookupHash).
 * Hashing: authLookupHash(canonical) for unique lookup; hash != wrap key (domain-separated).
 * Wrap key: base32-decoded bytes via wrapDEKForSecret (same trust as device secret, >=100 bits).
 * Single-use: enforced by usedAt + dekWrapped NULL after consumption.
 *
 * No master secret — each code independently wraps the DEK. Leaking one used code
 * + DB state = nothing (used codes are burned). Leaking an unused code requires both.
 */

import crypto from "crypto";
import { authLookupHash, wrapDEKForSecret, unwrapDEKForSecret } from "@/lib/api-auth";

// ─── Format and validation ──────────────────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_CODE_LEN = 20; // 100 bits in base32

/**
 * Normalize a recovery code: uppercase, strip non-alphanumeric, apply visual corrections (0→O, 1→I).
 * Rejects codes that are not exactly 20 chars after stripping.
 */
export function normalizeRecoveryCode(input: string): string {
  if (!input) throw new Error("Empty recovery code");

  // Uppercase and remove non-alphanumeric
  const upper = input.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Visual corrections (common confusions)
  const corrected = upper.replace(/0/g, "O").replace(/1/g, "I");

  // Reject if not exactly 20 chars
  if (corrected.length !== RECOVERY_CODE_LEN) {
    throw new Error(`Recovery code must be ${RECOVERY_CODE_LEN} characters (got ${corrected.length})`);
  }

  // Validate all chars are in base32 alphabet (after corrections, should be)
  for (const char of corrected) {
    if (!BASE32_ALPHABET.includes(char)) {
      throw new Error(`Invalid character in recovery code: ${char}`);
    }
  }

  return corrected;
}

/**
 * Hash a recovery code for database lookup (domain-separated from wrap key).
 * Input: canonical form `pfrc1:<20 chars>`.
 * Output: SHA-256 via authLookupHash (prefix "auth|").
 */
export function hashRecoveryCode(canonicalCode: string): string {
  if (!canonicalCode.startsWith("pfrc1:")) {
    throw new Error("Recovery code must be in canonical form (pfrc1:...)");
  }
  return authLookupHash(canonicalCode);
}

/**
 * Wrap the DEK using a recovery code secret.
 * The secret is domain-separated via secretWrapKey (prefix "dek|"),
 * ensuring the wrap key differs from the authLookupHash even for same input.
 * Returns the AES-GCM ciphertext (iv || ct || tag, base64).
 */
export function wrapDEKWithRecoveryCode(dek: Buffer, canonicalCode: string): string {
  if (!canonicalCode.startsWith("pfrc1:")) {
    throw new Error("Recovery code must be in canonical form (pfrc1:...)");
  }
  return wrapDEKForSecret(dek, canonicalCode);
}

/**
 * Unwrap the DEK using a recovery code secret.
 * Throws if decryption fails (wrong code, corrupted wrap).
 */
export function unwrapDEKWithRecoveryCode(wrapped: string, canonicalCode: string): Buffer {
  if (!canonicalCode.startsWith("pfrc1:")) {
    throw new Error("Recovery code must be in canonical form (pfrc1:...)");
  }
  return unwrapDEKForSecret(wrapped, canonicalCode);
}

/**
 * Generate N recovery codes (default 10) in display format.
 * Returns: [{ canonical: "pfrc1:...", display: "XXXXX-XXXXX-XXXXX-XXXXX" }, ...]
 * Each code is 100 bits of randomness, formatted as 20 base32 chars.
 */
export function generateRecoveryCodes(
  count = 10,
  rng: (n: number) => Buffer = crypto.randomBytes,
): Array<{ canonical: string; display: string }> {
  const codes: Array<{ canonical: string; display: string }> = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    let canonical: string;
    let attempts = 0;
    // Rejection sampling for uniqueness (plan: 1000)
    do {
      // 100 bits = 12.5 bytes; we generate 16 for safety margin
      const bytes = rng(16);
      // Encode first 100 bits as base32
      let bits = "";
      for (let j = 0; j < 100; j++) {
        const byteIdx = Math.floor(j / 8);
        const bitIdx = 7 - (j % 8);
        const bit = (bytes[byteIdx] >> bitIdx) & 1;
        bits += bit;
      }
      // Convert bits to base32
      let chars = "";
      for (let j = 0; j < bits.length; j += 5) {
        const chunk = bits.slice(j, j + 5).padEnd(5, "0");
        const val = parseInt(chunk, 2);
        chars += BASE32_ALPHABET[val];
      }
      canonical = `pfrc1:${chars}`;
      attempts++;
    } while (used.has(canonical) && attempts < 1000);

    if (attempts >= 1000) {
      throw new Error("Failed to generate unique recovery codes after 1000 attempts");
    }

    used.add(canonical);
    const display = `${canonical.slice(6, 11)}-${canonical.slice(11, 16)}-${canonical.slice(16, 21)}-${canonical.slice(21, 26)}`;
    codes.push({ canonical, display });
  }

  return codes;
}
