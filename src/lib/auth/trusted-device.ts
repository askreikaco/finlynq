/**
 * Trusted device management for passwordless re-login via Google.
 *
 * After a successful password unlock (or Google login on a new device),
 * we issue a device trust by:
 * 1. Generating a random 32-byte secret
 * 2. Hashing it for database lookup (authLookupHash)
 * 3. Wrapping the DEK with it (wrapDEKForSecret) and storing on user_devices
 * 4. Setting an httpOnly cookie `pf_device=<deviceId>.<secret>`
 *
 * On Google sign-in, if pf_device is present and valid:
 * 1. Look up the device by id
 * 2. Verify secret hash
 * 3. Unwrap the DEK
 * 4. Rotate: generate new secret, rewrap, store, update cookie
 * 5. Complete login without password
 *
 * Expiry: devices expire after PF_TRUSTED_DEVICE_DAYS (default 30, 0 = off).
 * Cookie Max-Age tracks the expiry for client-side cleanup.
 * Rotation extends expiry on each use (sliding window).
 */

import crypto from "crypto";
import { db } from "@/db";
import { userDevices } from "@/db/schema-pg";
import { eq, and } from "drizzle-orm";
import { authLookupHash, wrapDEKForSecret, unwrapDEKForSecret } from "@/lib/api-auth";

/**
 * Parse the device ID and secret from the cookie value.
 * Format: <uuid>.<base64url secret>
 */
function parseDeviceCookie(cookieValue: string): { id: string; secret: string } | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  return { id: parts[0], secret: parts[1] };
}

/**
 * Encode device ID and secret into the cookie value.
 */
function encodeDeviceCookie(id: string, secret: string): string {
  return `${id}.${secret}`;
}

/**
 * Return cookie options for pf_device.
 * httpOnly, Secure in production, SameSite=Lax, Path=/api/auth
 */
export function deviceCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
} {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  const maxAgeSeconds = days * 24 * 60 * 60; // 0 if days == 0

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Issue a trusted device after successful login (password or Google with MFA cleared).
 *
 * Generates a random device secret, wraps the DEK with it, stores a row in
 * user_devices, and returns the cookie value and max age.
 *
 * If PF_TRUSTED_DEVICE_DAYS is 0 (disabled), returns null.
 *
 * @param userId - The user ID
 * @param dek - The decrypted DEK
 * @param userAgent - User-Agent header for device labeling (optional)
 * @returns { id, cookieValue, maxAgeSeconds } or null if disabled
 */
export async function issueDevice(
  userId: string,
  dek: Buffer,
  userAgent?: string
): Promise<{ id: string; cookieValue: string; maxAgeSeconds: number } | null> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) {
    // Feature disabled
    return null;
  }

  const deviceId = crypto.randomUUID();
  const deviceSecret = crypto.randomBytes(32).toString("base64url");
  const secretHash = authLookupHash(deviceSecret);
  const dekWrapped = wrapDEKForSecret(dek, deviceSecret);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Extract a simple label from User-Agent if provided
  let label: string | null = null;
  if (userAgent) {
    // Simple heuristic: extract browser name
    if (userAgent.includes("Chrome")) label = "Chrome";
    else if (userAgent.includes("Safari")) label = "Safari";
    else if (userAgent.includes("Firefox")) label = "Firefox";
    else if (userAgent.includes("Edge")) label = "Edge";
    else label = "Browser";
  }

  await db.insert(userDevices).values({
    id: deviceId,
    userId,
    secretHash,
    dekWrapped,
    label,
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
  });

  const maxAgeSeconds = days * 24 * 60 * 60;
  const cookieValue = encodeDeviceCookie(deviceId, deviceSecret);

  return {
    id: deviceId,
    cookieValue,
    maxAgeSeconds,
  };
}

/**
 * Redeem a device cookie for DEK access.
 *
 * Validates the device (exists, not expired, not revoked, matches user),
 * unwraps the DEK, and returns it along with a rotated cookie value
 * (new secret + rewrap + extend expiry).
 *
 * On replayed/old secrets (device exists and belongs to user but secret hash
 * doesn't match), the device is revoked to prevent replay attacks.
 *
 * @param cookieValue - The cookie value (id.secret format)
 * @param userId - The expected user ID
 * @returns { dek, rotatedCookieValue } or null if invalid/expired/revoked/mismatch
 */
export async function redeemDevice(
  cookieValue: string,
  userId: string
): Promise<{
  dek: Buffer;
  rotatedCookieValue: string;
  maxAgeSeconds: number;
} | null> {
  const parsed = parseDeviceCookie(cookieValue);
  if (!parsed) return null;

  const { id, secret } = parsed;

  // Look up the device
  const rows = await db
    .select()
    .from(userDevices)
    .where(eq(userDevices.id, id))
    .limit(1);

  if (rows.length === 0) return null;
  const device = rows[0];

  // Verify user match
  if (device.userId !== userId) return null;

  // Check expiry and revocation
  const now = new Date();
  if (device.expiresAt && new Date(device.expiresAt) <= now) return null;
  if (device.revokedAt) return null;

  // Verify secret hash (constant-time to resist timing attacks)
  const expectedHash = authLookupHash(secret);
  if (!constantTimeEqual(device.secretHash, expectedHash)) {
    // Replayed or old secret: revoke this device to prevent abuse
    try {
      await revokeDevice(userId, id);
    } catch {
      // swallow — we still return null to fail the redemption
    }
    return null;
  }

  // Unwrap the DEK
  let dek: Buffer;
  try {
    dek = unwrapDEKForSecret(device.dekWrapped, secret);
  } catch {
    return null;
  }

  // Rotate: generate new secret, rewrap, update row
  const newSecret = crypto.randomBytes(32).toString("base64url");
  const newSecretHash = authLookupHash(newSecret);
  const newDekWrapped = wrapDEKForSecret(dek, newSecret);

  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  const newExpiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Import rotateDeviceSecret from queries for atomic conditional rotation
  const { rotateDeviceSecret } = await import("@/lib/auth/queries");
  const rotated = await rotateDeviceSecret(id, device.secretHash, {
    secretHash: newSecretHash,
    dekWrapped: newDekWrapped,
    expiresAt: newExpiresAt.toISOString(),
  });

  // If the conditional update failed (someone else rotated first, or hash changed),
  // treat it as a failed redemption
  if (!rotated) return null;

  const maxAgeSeconds = days * 24 * 60 * 60;
  const rotatedCookieValue = encodeDeviceCookie(id, newSecret);

  return {
    dek,
    rotatedCookieValue,
    maxAgeSeconds,
  };
}

/**
 * Revoke a specific device.
 */
export async function revokeDevice(userId: string, deviceId: string): Promise<void> {
  await db
    .update(userDevices)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(userDevices.userId, userId), eq(userDevices.id, deviceId)));
}

/**
 * Revoke all devices for a user (logout everywhere).
 */
export async function revokeAllDevices(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(userDevices)
    .set({ revokedAt: now })
    .where(eq(userDevices.userId, userId));
}

/**
 * Delete all devices for a user (used on password reset/wipe).
 */
export async function deleteAllDevices(userId: string): Promise<void> {
  await db.delete(userDevices).where(eq(userDevices.userId, userId));
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
