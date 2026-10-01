/**
 * Trusted device management for passwordless re-login via Google.
 *
 * After a successful password unlock (or Google login on a new device),
 * we issue a device trust by:
 * 1. Generating a random 32-byte secret
 * 2. Hashing it for database lookup (authLookupHash)
 * 3. Wrapping the DEK with it (wrapDEKForSecret) and storing on user_devices
 * 4. Setting an httpOnly cookie `pf_device=<deviceId>.<secret>[,<deviceId>.<secret>...]`
 *    (multi-account: one entry per user, <= MAX_DEVICE_ENTRIES, each verified
 *    independently; a login by B never overwrites A's entry)
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
import { eq, and, isNull } from "drizzle-orm";
import { authLookupHash, wrapDEKForSecret, unwrapDEKForSecret } from "@/lib/api-auth";

/** Max entries in one pf_device cookie (one per account on this browser). */
export const MAX_DEVICE_ENTRIES = 5;
/** Hard cap on the raw cookie we are willing to parse (5 entries are ~410 bytes). */
const MAX_COOKIE_LENGTH = 1024;
const ENTRY_RE = /^[A-Za-z0-9-]{1,64}\.[A-Za-z0-9_-]{1,128}$/;

interface DeviceEntry {
  id: string;
  secret: string;
}

/**
 * pf_device value: `<id>.<secret>[,<id>.<secret>...]` (<= MAX_DEVICE_ENTRIES).
 * A legacy single `<id>.<secret>` is a list of one. Malformed, duplicate and
 * surplus entries are dropped; nothing here trusts the content (callers verify
 * every entry against user_devices).
 */
function parseDeviceList(cookieValue: string | undefined): DeviceEntry[] {
  if (!cookieValue || cookieValue.length > MAX_COOKIE_LENGTH) return [];
  const out: DeviceEntry[] = [];
  const seen = new Set<string>();
  for (const part of cookieValue.split(",")) {
    if (!ENTRY_RE.test(part)) continue;
    const dot = part.indexOf(".");
    const id = part.slice(0, dot);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, secret: part.slice(dot + 1) });
    if (out.length >= MAX_DEVICE_ENTRIES) break;
  }
  return out;
}

function encodeDeviceList(entries: DeviceEntry[]): string {
  return entries
    .slice(0, MAX_DEVICE_ENTRIES)
    .map((e) => `${e.id}.${e.secret}`)
    .join(",");
}

type DeviceRow = typeof userDevices.$inferSelect;
type EntryState = "ok" | "unknown" | "dead" | "badSecret";
interface LoadedEntry {
  entry: DeviceEntry;
  row: DeviceRow | null;
  state: EntryState;
}

/**
 * Verify EVERY entry independently against user_devices (<= 5 point lookups):
 * unknown = no row, dead = revoked/expired, badSecret = row live but the
 * secret does not match (stale/forged), ok = row live + secret matches.
 */
async function loadEntries(cookieValue: string | undefined): Promise<LoadedEntry[]> {
  const entries = parseDeviceList(cookieValue);
  if (entries.length === 0) return [];
  const now = Date.now();
  const out: LoadedEntry[] = [];
  for (const entry of entries) {
    const rows = await db
      .select()
      .from(userDevices)
      .where(eq(userDevices.id, entry.id))
      .limit(1);
    const row = rows[0] ?? null;
    if (!row) out.push({ entry, row: null, state: "unknown" });
    else if (row.revokedAt || (row.expiresAt && new Date(row.expiresAt).getTime() <= now)) {
      out.push({ entry, row, state: "dead" });
    } else if (!constantTimeEqual(row.secretHash, authLookupHash(entry.secret))) {
      out.push({ entry, row, state: "badSecret" });
    } else out.push({ entry, row, state: "ok" });
  }
  return out;
}

/** First device id in a pf_device value (undefined if absent/garbled). Unverified. */
export function parseDeviceIdFromCookie(cookieValue: string | undefined): string | undefined {
  return parseDeviceList(cookieValue)[0]?.id;
}

/** All (unverified) device ids in a pf_device value. */
export function parseDeviceIdsFromCookie(cookieValue: string | undefined): string[] {
  return parseDeviceList(cookieValue).map((e) => e.id);
}

/** Id of THIS browser's verified, live device entry owned by userId (else undefined). */
export async function findUserDeviceId(
  cookieValue: string | undefined,
  userId: string
): Promise<string | undefined> {
  const loaded = await loadEntries(cookieValue);
  return loaded.find((l) => l.state === "ok" && l.row!.userId === userId)?.entry.id;
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
 * user_devices, and returns the new entry plus the merged pf_device list.
 *
 * Merge (when currentCookie is given): new entry first; this user's own
 * entries in the cookie are revoked and dropped; OTHER users' entries are kept
 * only if they verify (live row + secret); list bounded to MAX_DEVICE_ENTRIES,
 * oldest (tail) evicted and revoked.
 *
 * If PF_TRUSTED_DEVICE_DAYS is 0 (disabled), returns null.
 * Prunes devices to keep at most 10 non-revoked devices per user.
 *
 * @param replaceDeviceId - Optional extra device id to revoke (only if it belongs to the user)
 * @param currentCookie - Current pf_device value (list) from the request
 * @returns { id, cookieValue (new single entry), cookieList (value to Set-Cookie), maxAgeSeconds }
 */
export async function issueDevice(
  userId: string,
  dek: Buffer,
  userAgent?: string,
  replaceDeviceId?: string,
  currentCookie?: string
): Promise<{ id: string; cookieValue: string; cookieList: string; maxAgeSeconds: number } | null> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) {
    return null;
  }

  // Load + verify the existing list BEFORE inserting.
  const existing = await loadEntries(currentCookie);

  // Revoke replaceDeviceId if it belongs to this user, plus this user's own
  // entries in the cookie (they are replaced by the new one).
  const toRevoke = new Set<string>();
  if (replaceDeviceId) {
    try {
      const device = await db
        .select()
        .from(userDevices)
        .where(eq(userDevices.id, replaceDeviceId))
        .limit(1);
      if (device.length > 0 && device[0].userId === userId) toRevoke.add(replaceDeviceId);
    } catch {
      // Swallow error; continue to issue new device
    }
  }
  for (const l of existing) if (l.row && l.row.userId === userId) toRevoke.add(l.entry.id);
  for (const id of toRevoke) {
    try {
      await revokeDevice(userId, id);
    } catch {
      // best-effort
    }
  }

  const deviceId = crypto.randomUUID();
  const deviceSecret = crypto.randomBytes(32).toString("base64url");
  const secretHash = authLookupHash(deviceSecret);
  const dekWrapped = wrapDEKForSecret(dek, deviceSecret);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

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

  // Prune: keep at most 10 non-revoked devices, revoke oldest by created_at
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

  // Merge: new entry first, then other users' VERIFIED entries (forged/stale dropped).
  const keep = existing.filter((l) => l.state === "ok" && l.row!.userId !== userId);
  const kept = keep.slice(0, MAX_DEVICE_ENTRIES - 1);
  for (const l of keep.slice(MAX_DEVICE_ENTRIES - 1)) {
    try {
      await revokeDevice(l.row!.userId, l.entry.id); // evicted: secret no longer in any cookie
    } catch {
      // best-effort
    }
  }
  const newEntry: DeviceEntry = { id: deviceId, secret: deviceSecret };
  const cookieList = encodeDeviceList([newEntry, ...kept.map((l) => l.entry)]);

  return {
    id: deviceId,
    cookieValue: encodeDeviceList([newEntry]),
    cookieList,
    maxAgeSeconds: days * 24 * 60 * 60,
  };
}

/**
 * Peek at a device to check if it's valid, without unwrapping, rotating or
 * revoking anything. With userId: the entry owned by that user; with deviceId:
 * that specific entry; without either: the first valid entry. Every entry is
 * verified independently (secret, expiry, revocation, owner).
 */
export async function peekDevice(
  cookieValue: string | undefined,
  userId?: string,
  deviceId?: string
): Promise<
  | { valid: true; userId: string; deviceId: string; label: string | null; needsProof: "totp" | "code" | null }
  | { valid: false }
> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) return { valid: false };

  const loaded = await loadEntries(cookieValue);
  const hit = loaded.find(
    (l) =>
      l.state === "ok" &&
      (userId === undefined || l.row!.userId === userId) &&
      (deviceId === undefined || l.entry.id === deviceId)
  );
  if (!hit) return { valid: false };
  // (B2 doesn't implement proof requirements; B3 will add that)
  return { valid: true, userId: hit.row!.userId, deviceId: hit.row!.id, label: hit.row!.label, needsProof: null };
}

/**
 * Every VALID entry in the pf_device list (live row + matching secret), in
 * cookie order, for the recovery account picker. Entries that fail
 * verification (unknown, revoked, expired, wrong secret) are never listed:
 * without a valid device secret nothing about an account is revealed.
 */
export async function listValidDevices(
  cookieValue: string | undefined
): Promise<Array<{ userId: string; deviceId: string; label: string | null }>> {
  const days = Math.max(0, parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10));
  if (days === 0) return [];
  const loaded = await loadEntries(cookieValue);
  return loaded
    .filter((l) => l.state === "ok")
    .map((l) => ({ userId: l.row!.userId, deviceId: l.row!.id, label: l.row!.label }));
}

/**
 * Shared core of redeemDevice / redeemDeviceWithoutRotate / rotateDevice:
 * find userId's entry in the list, verify it, unwrap the DEK, and (rotate)
 * swap its secret. Replay (live row owned by userId but stale secret) revokes
 * that device. Other users' entries are never touched, only verified.
 */
async function redeemEntry(
  cookieValue: string | undefined,
  userId: string,
  rotate: boolean
): Promise<{ dek: Buffer; list: string; maxAgeSeconds: number } | null> {
  const days = Math.max(
    0,
    parseInt(process.env.PF_TRUSTED_DEVICE_DAYS || "30", 10)
  );
  if (days === 0) return null;

  const loaded = await loadEntries(cookieValue);
  const maxAgeSeconds = days * 24 * 60 * 60;

  for (const l of loaded) {
    if (!l.row || l.row.userId !== userId) continue;
    if (l.state === "badSecret") {
      // Replayed or old secret: revoke this device to prevent abuse
      try {
        await revokeDevice(userId, l.entry.id);
      } catch {
        // swallow — we still fail the redemption
      }
      continue;
    }
    if (l.state !== "ok") continue;

    let dek: Buffer;
    try {
      dek = unwrapDEKForSecret(l.row.dekWrapped, l.entry.secret);
    } catch {
      continue;
    }

    if (!rotate) {
      // Nothing rotates, so the cookie is not rewritten.
      return { dek, list: cookieValue as string, maxAgeSeconds };
    }

    const newSecret = crypto.randomBytes(32).toString("base64url");
    const newExpiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
    const { rotateDeviceSecret } = await import("@/lib/auth/queries");
    const rotated = await rotateDeviceSecret(l.row.id, l.row.secretHash, {
      secretHash: authLookupHash(newSecret),
      dekWrapped: wrapDEKForSecret(dek, newSecret),
      expiresAt: newExpiresAt.toISOString(),
    });
    // Conditional update lost (someone rotated first): failed redemption.
    if (!rotated) return null;

    // Rewrite: only verified entries survive (tampered/stale/forged dropped),
    // this user's entry carries the new secret.
    const list = encodeDeviceList(
      loaded
        .filter((x) => x === l || x.state === "ok")
        .map((x) => (x === l ? { id: x.entry.id, secret: newSecret } : x.entry))
    );
    return { dek, list, maxAgeSeconds };
  }
  return null;
}

/**
 * Redeem userId's device from the pf_device list WITHOUT rotating: the secret
 * stays valid. cookieValue in the result is the list unchanged.
 */
export async function redeemDeviceWithoutRotate(
  cookieValue: string | undefined,
  userId: string
): Promise<{
  dek: Buffer;
  cookieValue: string;
  maxAgeSeconds: number;
} | null> {
  const r = await redeemEntry(cookieValue, userId, false);
  return r && { dek: r.dek, cookieValue: r.list, maxAgeSeconds: r.maxAgeSeconds };
}

/**
 * Redeem userId's device from the pf_device list WITH rotation (new secret,
 * rewrap, sliding expiry). rotatedCookieValue is the whole list to Set-Cookie:
 * other users' verified entries preserved, tampered entries dropped.
 * On replayed/old secrets the device is revoked.
 */
export async function redeemDevice(
  cookieValue: string | undefined,
  userId: string
): Promise<{
  dek: Buffer;
  rotatedCookieValue: string;
  maxAgeSeconds: number;
} | null> {
  const r = await redeemEntry(cookieValue, userId, true);
  return r && { dek: r.dek, rotatedCookieValue: r.list, maxAgeSeconds: r.maxAgeSeconds };
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
 * Rotate userId's device in the list: new secret, rewrap, extend expiry.
 * Returns the new list or null if the device is invalid/revoked.
 * The old secret becomes invalid (reuse is treated as replay: device revoked).
 */
export async function rotateDevice(
  cookieValue: string | undefined,
  userId: string
): Promise<{ rotatedCookieValue: string; maxAgeSeconds: number } | null> {
  const r = await redeemEntry(cookieValue, userId, true);
  return r && { rotatedCookieValue: r.list, maxAgeSeconds: r.maxAgeSeconds };
}

/**
 * Remove userId's entries from a pf_device value (logout everywhere, shared
 * computer). Other users' entries are kept iff they verify; unknown/forged
 * entries are dropped. revoke:true also revokes the removed user's rows.
 * Returns the new value ("" = clear the cookie).
 */
export async function removeUserDevicesFromList(
  cookieValue: string | undefined,
  removeUserId: string,
  opts: { revoke?: boolean } = {}
): Promise<{ newDeviceList: string; removed: boolean }> {
  const loaded = await loadEntries(cookieValue);
  let removed = false;
  const keep: DeviceEntry[] = [];
  for (const l of loaded) {
    if (l.row && l.row.userId === removeUserId) {
      removed = true;
      if (opts.revoke) {
        try {
          await revokeDevice(removeUserId, l.entry.id);
        } catch {
          // best-effort
        }
      }
    } else if (l.state === "ok") {
      keep.push(l.entry);
    }
  }
  return { newDeviceList: encodeDeviceList(keep), removed };
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
