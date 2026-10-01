/**
 * Account recovery: finalizeRecoveryReset
 *
 * No-wipe recovery (data intact). Called by recovery code/device/passkey
 * routes AFTER the method proof and 2FA gate (plan 1.3/1.4).
 *
 * Order:
 *   1. validate password; derive new KEK; wrap the SAME DEK
 *   2. TX (applyRecoveryRewrapTx): password+wrap, session_not_before=cutoff,
 *      burn pending email-reset tokens, revoke ALL OAuth grants (access+refresh,
 *      unexchanged auth codes). Failure -> nothing changed.
 *   3. evict DEK cache + MCP tx cache (cutoff cache busted inside the query)
 *   4. revokeAllDevicesExcept(keepDeviceId)   (throws -> caller sees failure)
 *   5. wait until the wall clock is past the cutoff second, then mint the
 *      replacement session with a natural iat/exp (no forged timestamps)
 *   6. put DEK for the new session; issue/rotate trusted device
 *   7. fire-and-forget: security event + passwordChanged email
 */

import { deriveKEK, wrapDEK, generateSalt } from "@/lib/crypto/envelope";
import { evictAllForUser, putDEK } from "@/lib/crypto/dek-cache";
import { invalidateUser } from "@/lib/mcp/user-tx-cache";
import { applyRecoveryRewrapTx, revokeAllDevicesExcept, getUserById } from "./queries";
import { createSessionToken, SESSION_TTL_MS } from "./jwt";
import { waitUntilAfterCutoff } from "./session-cutoff";
import { issueDevice } from "./trusted-device";
import { logSecurityEvent } from "./security-events";
import { sendEmail, passwordChangedEmail } from "@/lib/email";
import { hashPassword } from "@/lib/auth";
import { validatePasswordStrength } from "./password-policy";

export interface FinalizeRecoveryResetOptions {
  userId: string;
  /** New password (must pass validatePasswordStrength) */
  newPassword: string;
  /** DEK the user proved they can unwrap via the recovery method (32 bytes) */
  dek: Buffer;
  /** Device being used for recovery (device method): all other devices are revoked, this one is rotated */
  keepDeviceId?: string;
  /** false = "shared computer": issue no pf_device (default true) */
  trustDevice?: boolean;
  userAgent?: string;
  ip?: string;
  method?: "code" | "device" | "passkey";
}

export interface FinalizeRecoveryResetResult {
  token: string;
  jti: string;
  sessionId: string;
  /** New trusted device (cookie value `<id>.<secret>`), absent when disabled / shared computer */
  deviceId?: string;
  deviceCookieValue?: string;
  maxAgeSeconds?: number;
}

export async function finalizeRecoveryReset(
  options: FinalizeRecoveryResetOptions
): Promise<FinalizeRecoveryResetResult> {
  const { userId, newPassword, keepDeviceId, userAgent, ip, method } = options;
  if (!Buffer.isBuffer(options.dek) || options.dek.length !== 32) {
    throw new Error("Invalid DEK");
  }
  // Private copy: evictAllForUser zeroes cached buffers in place, and the
  // caller's buffer may be one of them.
  const dek = Buffer.from(options.dek);

  const pwErr = validatePasswordStrength(newPassword);
  if (pwErr) throw new Error(`Password validation failed: ${pwErr}`);

  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");
  if (!(user.kekSalt && user.dekWrapped && user.dekWrappedIv && user.dekWrappedTag)) {
    throw new Error("User has no encrypted envelope");
  }

  const pepperVersion = user.pepperVersion ?? 1;
  const newHash = await hashPassword(newPassword);
  const newSalt = generateSalt();
  const newKek = deriveKEK(newPassword, newSalt, pepperVersion);
  const w = wrapDEK(newKek, dek, newSalt);
  const wrap = {
    kekSalt: w.salt.toString("base64"),
    dekWrapped: w.wrapped.toString("base64"),
    dekWrappedIv: w.iv.toString("base64"),
    dekWrappedTag: w.tag.toString("base64"),
  };

  const cutoff = new Date();
  await applyRecoveryRewrapTx(userId, newHash, wrap, cutoff);

  evictAllForUser(userId);
  invalidateUser(userId);

  await revokeAllDevicesExcept(userId, keepDeviceId);

  // Mint strictly after the cutoff second so the replacement session survives
  // its own cutoff while same-second pre-reset tokens stay dead.
  await waitUntilAfterCutoff(cutoff);
  const { token, jti } = await createSessionToken(userId, true);
  putDEK(jti, dek, SESSION_TTL_MS, userId);

  let deviceId: string | undefined;
  let deviceCookieValue: string | undefined;
  let maxAgeSeconds: number | undefined;
  if (options.trustDevice !== false) {
    // issueDevice(replaceDeviceId) revokes the kept device and issues a fresh
    // secret: the old pf_device cookie dies, the new one is returned.
    const issued = await issueDevice(userId, dek, undefined, userAgent);
    if (issued) {
      deviceCookieValue = issued.newDeviceEntry;
      maxAgeSeconds = issued.maxAgeSeconds;
    }
  }

  logSecurityEvent(userId, "recovery_reset_success", { method, ip, userAgent }).catch(() => {});

  if (user.email) {
    const displayName = (user.displayName || user.username || "").toString() || undefined;
    void (async () => {
      try {
        await sendEmail(passwordChangedEmail(user.email as string, displayName));
      } catch {
        // recovery already complete; email failure must not surface
      }
    })();
  }

  return { token, jti, sessionId: jti, deviceId, deviceCookieValue, maxAgeSeconds };
}
