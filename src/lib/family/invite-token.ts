/**
 * Family Wealth invite token generation and verification.
 *
 * Tokens are:
 * - Generated as random bytes (32 bytes / 256 bits)
 * - Stored as domain-separated SHA-256 hashes (HMAC-SHA256 with key "family-invite|")
 * - Single-use (consumed_at timestamp)
 * - Expires after 7 days
 */

import { createHmac, randomBytes } from "crypto";

const DOMAIN = "family-invite|";
const INVITE_VALIDITY_MS = 7 * 24 * 60 * 60_000; // 7 days

/**
 * Generate a random invite token (not hashed; suitable for sending via email).
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash an invite token for storage. Uses HMAC-SHA256 with a domain-separated key.
 */
export function hashInviteToken(token: string): string {
  const hmac = createHmac("sha256", DOMAIN);
  hmac.update(token);
  return hmac.digest("hex");
}

/**
 * Calculate the expiration timestamp for an invite (7 days from now).
 */
export function getInviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_VALIDITY_MS);
}
