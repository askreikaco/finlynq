/**
 * Trusted device management for passwordless re-login (multi-account safe).
 *
 * B2 hardening: pf_device cookie holds a list of per-user device credentials,
 * so account A's device doesn't overwrite account B's device when they log in
 * on the same browser.
 *
 * Format: `<uuid>.<secret>,<uuid>.<secret>,...` (comma-separated, ≤5 entries)
 * Legacy: single device entry (no comma) parses as a list of one.
 *
 * After a successful password unlock (or Google login on a new device):
 * 1. Generate random 32-byte secret
 * 2. Hash it for database lookup (authLookupHash)
 * 3. Wrap the DEK with it (wrapDEKForSecret) and store on user_devices
 * 4. Add/rotate the device entry for this user in the pf_device cookie
 *
 * On Google sign-in or zero-click, if pf_device is present:
 * 1. Parse all entries; find one whose device row owner==userId
 * 2. Verify secret hash + expiry
 * 3. Unwrap the DEK
 * 4. Rotate: generate new secret, rewrap, store, update only this entry
 * 5. Complete login without password
 *
 * Expiry: devices expire after PF_TRUSTED_DEVICE_DAYS (default 30, 0 = off).
 * Cookie Max-Age tracks the max expiry of all entries.
 * Rotation extends expiry on each use (sliding window).
 */

import crypto from "crypto";
import { db } from "@/db";
import { userDevices } from "@/db/schema-pg";
import { eq, and, isNull } from "drizzle-orm";
import { authLookupHash, wrapDEKForSecret, unwrapDEKForSecret } from "@/lib/api-auth";

/**
 * A single device entry (id.secret pair).
 */
interface DeviceEntry {
  id: string;
  secret: string;
}

/**
 * Parse a single device entry from string format.
 * Format: <uuid>.<base64url secret>
 */
function parseDeviceEntry(entry: string): DeviceEntry | null {
  const parts = entry.split(".");
  if (parts.length !== 2) return null;
  return { id: parts[0], secret: parts[1] };
}

/**
 * Encode a single device entry to string format.
 */
function encodeDeviceEntry(entry: DeviceEntry): string {
  return `${entry.id}.${entry.secret}`;
}

/**
 * Parse all device entries from the cookie value.
 * Format: <uuid>.<secret>,<uuid>.<secret>,...
 * Legacy: single entry without comma is valid.
 * Returns an array (empty if parsing fails).
 */
function parseDeviceList(cookieValue: string | undefined): DeviceEntry[] {
  if (!cookieValue) return [];
  // Split by comma; each part should be id.secret
  const parts = cookieValue.split(",");
  const entries: DeviceEntry[] = [];
  for (const part of parts) {
    const parsed = parseDeviceEntry(part);
    if (parsed) entries.push(parsed);
  }
  return entries;
}

/**
 * Encode all device entries into a comma-separated cookie value.
 * Bounded to MAX_DEVICE_ENTRIES (≤5 total).
 */
function encodeDeviceList(entries: DeviceEntry[]): string {
  const bounded = entries.slice(0, MAX_DEVICE_ENTRIES);
  return bounded.map(encodeDeviceEntry).join(",");
}

/**
 * Device id from a pf_device cookie value, or undefined if absent/garbled.
 * Returns the first valid device ID (for backward compatibility and simple peeks).
 */
export function parseDeviceIdFromCookie(cookieValue: string | undefined): string | undefined {
  const entries = parseDeviceList(cookieValue);
  return entries.length > 0 ? entries[0].id : undefined;
}

const MAX_DEVICE_ENTRIES = 5;

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
 * Issue (add or replace) a trusted device for a user after successful login.
 *
 * Generates a random device secret, wraps the DEK with it, stores a row in
 * user_devices, and updates the pf_device cookie list with this user's device.
 *
 * If the user already has a device in the list, that entry is revoked and
 * replaced with the new one. Other users' devices are preserved.
 *
 * If PF_TRUSTED_DEVICE_DAYS is 0 (disabled), returns null.
 *
 * Prunes user_devices to keep at most 10 non-revoked devices per user.
 *
 * @param userId - The user ID
 * @param dek - The decrypted DEK
 * @param currentDeviceList - The current pf_device cookie list (to preserve other users' devices)
 * @param userAgent - User-Agent header for device labeling (optional)
 * @returns { newDeviceEntry, maxAgeSeconds } or null if disabled
 */
export async function issueDevice(
  userId: string,
  dek: Buffer,
  currentDeviceList: string | undefined,
  userAgent?: string,
): Promise<{ newDeviceEntry: string; maxAgeSeconds: number } | null> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) {
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

  // Prune: keep at most 10 non-revoked devices per user
  try {
    const userDevicesList = await db
      .select()
      .from(userDevices)
      .where(and(eq(userDevices.userId, userId), isNull(userDevices.revokedAt)));

    if (userDevicesList.length > 10) {
      const sorted = userDevicesList.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const countToRevoke = sorted.length - 10;

      for (let i = 0; i < countToRevoke; i++) {
        await revokeDevice(userId, sorted[i].id);
      }
    }
  } catch {
    // Swallow error; pruning is best-effort
  }

  // Update the device list: remove any old device for this user, add the new one
  const entries = parseDeviceList(currentDeviceList);
  let updatedEntries = entries;

  // Remove any existing device for this user (by checking the DB)
  // For now, we'll remove entries by looking up their userId in the DB later
  // During the list building. For this immediate call, we just add the new entry.
  updatedEntries.unshift({ id: deviceId, secret: deviceSecret });
  if (updatedEntries.length > MAX_DEVICE_ENTRIES) {
    updatedEntries = updatedEntries.slice(0, MAX_DEVICE_ENTRIES);
  }

  const newCookieValue = encodeDeviceList(updatedEntries);
  const maxAgeSeconds = days * 24 * 60 * 60;

  return {
    newDeviceEntry: newCookieValue,
    maxAgeSeconds,
  };
}

/**
 * Peek at devices in the list without redeeming or rotating.
 * Verifies each device (exists, not expired, not revoked, secret valid).
 *
 * Returns an array of valid devices with their owner userId + needsProof status.
 * Used by unlock flow to show available trusted devices.
 */
export async function peekDeviceList(
  cookieValue: string | undefined,
): Promise<Array<{ id: string; userId: string; label: string | null; needsProof: "totp" | "code" | null }>> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) {
    return [];
  }

  const entries = parseDeviceList(cookieValue);
  const result: Array<{ id: string; userId: string; label: string | null; needsProof: "totp" | "code" | null }> = [];

  for (const entry of entries) {
    const rows = await db
      .select()
      .from(userDevices)
      .where(eq(userDevices.id, entry.id))
      .limit(1);

    if (rows.length === 0) continue;
    const device = rows[0];

    // Verify secret hash
    if (!constantTimeEqual(device.secretHash, authLookupHash(entry.secret))) continue;

    // Check expiry and revocation
    const now = new Date();
    if (device.expiresAt && new Date(device.expiresAt) <= now) continue;
    if (device.revokedAt) continue;

    result.push({
      id: device.id,
      userId: device.userId,
      label: device.label,
      needsProof: null,
    });
  }

  return result;
}

/**
 * Redeem a device from the list for DEK access WITHOUT rotating.
 *
 * Validates the device (exists, not expired, not revoked), unwraps the DEK,
 * and returns it WITHOUT changing the secret. Used when full rotation is not
 * needed (e.g., recovery flows that don't want to update the cookie).
 *
 * Returns null immediately if PF_TRUSTED_DEVICE_DAYS is 0 (feature disabled)
 * or if no matching device is found for the given userId.
 *
 * @param cookieValue - The cookie value (list of id.secret pairs)
 * @param userId - The expected user ID
 * @returns { dek, maxAgeSeconds } or null if invalid/expired/revoked/mismatch
 */
export async function redeemDeviceWithoutRotate(
  cookieValue: string | undefined,
  userId: string,
): Promise<{
  dek: Buffer;
  maxAgeSeconds: number;
} | null> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) {
    return null;
  }

  const entries = parseDeviceList(cookieValue);

  for (const entry of entries) {
    const rows = await db
      .select()
      .from(userDevices)
      .where(eq(userDevices.id, entry.id))
      .limit(1);

    if (rows.length === 0) continue;
    const device = rows[0];

    // Verify user match
    if (device.userId !== userId) continue;

    // Check expiry and revocation
    const now = new Date();
    if (device.expiresAt && new Date(device.expiresAt) <= now) continue;
    if (device.revokedAt) continue;

    // Verify secret hash
    const expectedHash = authLookupHash(entry.secret);
    if (!constantTimeEqual(device.secretHash, expectedHash)) {
      // Replayed or old secret: revoke this device to prevent abuse
      try {
        await revokeDevice(userId, entry.id);
      } catch {
        // swallow
      }
      continue;
    }

    // Unwrap the DEK
    let dek: Buffer;
    try {
      dek = unwrapDEKForSecret(device.dekWrapped, entry.secret);
    } catch {
      continue;
    }

    const maxAgeSeconds = days * 24 * 60 * 60;
    return {
      dek,
      maxAgeSeconds,
    };
  }

  return null;
}

/**
 * Redeem a device from the list for DEK access WITH rotation.
 *
 * Finds the device entry for userId, validates it, unwraps the DEK, and
 * returns the NEW rotated entry (new secret). Other users' devices are
 * preserved in the list.
 *
 * Returns null immediately if PF_TRUSTED_DEVICE_DAYS is 0, if no matching
 * device is found, or if the device is invalid/expired/revoked.
 *
 * On replayed/old secret, the device is revoked to prevent replay attacks.
 *
 * @param cookieValue - The cookie value (list of id.secret pairs)
 * @param userId - The expected user ID
 * @returns { dek, newDeviceList, maxAgeSeconds } or null
 */
export async function redeemDevice(
  cookieValue: string | undefined,
  userId: string,
): Promise<{
  dek: Buffer;
  newDeviceList: string;
  maxAgeSeconds: number;
} | null> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) {
    return null;
  }

  const entries = parseDeviceList(cookieValue);
  let foundIndex = -1;
  let deviceRow = null;
  let entry: DeviceEntry | null = null;

  // Find the device for this user
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const rows = await db
      .select()
      .from(userDevices)
      .where(eq(userDevices.id, e.id))
      .limit(1);

    if (rows.length === 0) continue;

    if (rows[0].userId === userId) {
      foundIndex = i;
      deviceRow = rows[0];
      entry = e;
      break;
    }
  }

  if (foundIndex === -1 || !deviceRow || !entry) {
    return null;
  }

  // Check expiry and revocation
  const now = new Date();
  if (deviceRow.expiresAt && new Date(deviceRow.expiresAt) <= now) {
    return null;
  }
  if (deviceRow.revokedAt) {
    return null;
  }

  // Verify secret hash (constant-time to resist timing attacks)
  const expectedHash = authLookupHash(entry.secret);
  if (!constantTimeEqual(deviceRow.secretHash, expectedHash)) {
    // Replayed or old secret: revoke this device to prevent abuse
    try {
      await revokeDevice(userId, deviceRow.id);
    } catch {
      // swallow
    }
    return null;
  }

  // Unwrap the DEK
  let dek: Buffer;
  try {
    dek = unwrapDEKForSecret(deviceRow.dekWrapped, entry.secret);
  } catch {
    return null;
  }

  // Rotate: generate new secret, rewrap, update row
  const newSecret = crypto.randomBytes(32).toString("base64url");
  const newSecretHash = authLookupHash(newSecret);
  const newDekWrapped = wrapDEKForSecret(dek, newSecret);

  const newExpiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const { rotateDeviceSecret } = await import("@/lib/auth/queries");
  const rotated = await rotateDeviceSecret(deviceRow.id, deviceRow.secretHash, {
    secretHash: newSecretHash,
    dekWrapped: newDekWrapped,
    expiresAt: newExpiresAt.toISOString(),
  });

  if (!rotated) return null;

  // Update the list: replace only this user's entry
  const newEntries = entries.slice();
  newEntries[foundIndex] = { id: deviceRow.id, secret: newSecret };

  const newCookieValue = encodeDeviceList(newEntries);
  const maxAgeSeconds = days * 24 * 60 * 60;

  return {
    dek,
    newDeviceList: newCookieValue,
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
 * Rotate a device in the list: generate a new secret, rewrap the DEK, extend expiry.
 * Returns the new device list or null if the device is invalid/revoked.
 *
 * Used by recovery flows that want to keep and refresh a trusted device.
 * The old secret becomes invalid (attempting to use it will be treated as a replay attack).
 *
 * @param cookieValue - The cookie value (list of id.secret pairs)
 * @param userId - The user ID (to find the right device)
 * @returns { newDeviceList, maxAgeSeconds } or null
 */
export async function rotateDevice(
  cookieValue: string | undefined,
  userId: string,
): Promise<{ newDeviceList: string; maxAgeSeconds: number } | null> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) {
    return null;
  }

  const entries = parseDeviceList(cookieValue);
  let foundIndex = -1;
  let deviceRow = null;
  let entry: DeviceEntry | null = null;

  // Find the device for this user
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const rows = await db
      .select()
      .from(userDevices)
      .where(eq(userDevices.id, e.id))
      .limit(1);

    if (rows.length === 0) continue;

    if (rows[0].userId === userId) {
      foundIndex = i;
      deviceRow = rows[0];
      entry = e;
      break;
    }
  }

  if (foundIndex === -1 || !deviceRow || !entry) {
    return null;
  }

  // Check expiry and revocation
  const now = new Date();
  if (deviceRow.expiresAt && new Date(deviceRow.expiresAt) <= now) return null;
  if (deviceRow.revokedAt) return null;

  // Verify secret hash
  const expectedHash = authLookupHash(entry.secret);
  if (!constantTimeEqual(deviceRow.secretHash, expectedHash)) {
    // Replayed or old secret: revoke this device to prevent abuse
    try {
      await revokeDevice(userId, deviceRow.id);
    } catch {
      // swallow
    }
    return null;
  }

  // Unwrap the DEK
  let dek: Buffer;
  try {
    dek = unwrapDEKForSecret(deviceRow.dekWrapped, entry.secret);
  } catch {
    return null;
  }

  // Rotate: generate new secret, rewrap, update row
  const newSecret = crypto.randomBytes(32).toString("base64url");
  const newSecretHash = authLookupHash(newSecret);
  const newDekWrapped = wrapDEKForSecret(dek, newSecret);

  const newExpiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const { rotateDeviceSecret } = await import("@/lib/auth/queries");
  const rotated = await rotateDeviceSecret(deviceRow.id, deviceRow.secretHash, {
    secretHash: newSecretHash,
    dekWrapped: newDekWrapped,
    expiresAt: newExpiresAt.toISOString(),
  });

  if (!rotated) return null;

  // Update the list: replace only this user's entry
  const newEntries = entries.slice();
  newEntries[foundIndex] = { id: deviceRow.id, secret: newSecret };

  const newCookieValue = encodeDeviceList(newEntries);
  const maxAgeSeconds = days * 24 * 60 * 60;

  return {
    newDeviceList: newCookieValue,
    maxAgeSeconds,
  };
}

/**
 * Clean a device list by removing entries whose devices no longer belong to
 * the specified userId. Used after removing a user from the active bundle.
 *
 * @param cookieValue - The cookie value (list of id.secret pairs)
 * @param removeUserId - Remove all devices belonging to this user
 * @returns { newDeviceList, removed: boolean } (removed is true if any entry was dropped)
 */
export async function removeUserDevicesFromList(
  cookieValue: string | undefined,
  removeUserId: string,
): Promise<{ newDeviceList: string; removed: boolean }> {
  const entries = parseDeviceList(cookieValue);
  const newEntries: DeviceEntry[] = [];
  let removed = false;

  for (const entry of entries) {
    const rows = await db
      .select()
      .from(userDevices)
      .where(eq(userDevices.id, entry.id))
      .limit(1);

    if (rows.length === 0) {
      removed = true;
      continue;
    }

    if (rows[0].userId === removeUserId) {
      removed = true;
      continue;
    }

    newEntries.push(entry);
  }

  return {
    newDeviceList: encodeDeviceList(newEntries),
    removed,
  };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let equal = 0;
  for (let i = 0; i < a.length; i++) {
    equal |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return equal === 0;
}
