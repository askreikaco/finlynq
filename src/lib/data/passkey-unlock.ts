/**
 * App-side facade for passkey unlock of the on-device offline copy (local-first). Components import from here, never from
 * src/lib/local-first directly (same rule as local-read-cache-wipe.ts).
 *
 * The flag (localStorage "finlynq.lf.passkey" === "1") gates the Settings card. The data gate keys off the stored
 * passkey record, so an enrolled browser stays locked whatever the flag says.
 */
import { useEffect, useState } from "react";
import { isPasskeyUnlockFlagOn, readPasskeyUnlockRecord, unlockWithPasskey as unlockRecord, disablePasskeyUnlock as disableRecord, wipePasskeyUnlock, onPasskeyLockChange, passkeyEnrolledHint, passkeyLockedNow, refreshPasskeyLock, type PasskeyResult } from "@/lib/local-first/crypto/passkey-unlock";
import { disablePasskeySeal, enrollPasskeySeal, finishPasskeySeal } from "@/lib/local-first/crypto/passkey-lifecycle";
import { wipeOutboxUser } from "@/lib/local-first/write-path/outbox-store";
import { wipeUser as wipeReadCacheUser } from "@/lib/local-first/read-cache/persist-store";
import { disposeReadCache } from "@/lib/local-first/read-cache/session";
import { isLocalWriteQueueEnabled } from "@/lib/local-first/write-path/flag";
import { resumeOfflineAfterPasskey, startLocalWriteQueue, stopLocalWriteQueue } from "./local-write-queue";
import { wipeUser as wipePersistedDataCache } from "./persist";
import { readOfflineIdentity } from "./offline-identity";
import { fetchTrustedDeviceId } from "./trusted-device";
import { getSessionInfo, onSessionInfo } from "./session-info";

export {
  getPasskeyUnlockStatus,
  hasPasskeyUnlockedSession,
  onPasskeyLockChange,
  passkeyLockedNow,
  passkeyPersistBlocked,
  refreshPasskeyLock,
  type PasskeyResult,
  type PasskeyUnlockStatus,
} from "@/lib/local-first/crypto/passkey-unlock";

export const isPasskeyUnlockOn = isPasskeyUnlockFlagOn;

/** The trusted device id for this user, for enrolment: the remembered one (works offline) or a live check. Null when untrusted. */
async function enrollDeviceId(userId: string): Promise<string | null> {
  const remembered = readOfflineIdentity();
  if (remembered && remembered.userId === userId) return remembered.deviceId;
  return fetchTrustedDeviceId();
}

/**
 * The device id the offline copy is bound to: the record's (stored at enrolment), else the remembered identity. No
 * network. Null when there is no record and no remembered identity.
 */
export async function resolvePasskeyDeviceId(userId: string): Promise<string | null> {
  let rec: Awaited<ReturnType<typeof readPasskeyUnlockRecord>> = null;
  try {
    rec = await readPasskeyUnlockRecord(userId);
  } catch {
    rec = null;
  }
  if (rec?.deviceId) return rec.deviceId;
  const remembered = readOfflineIdentity();
  return remembered && remembered.userId === userId ? remembered.deviceId : null;
}

/**
 * Turns passkey unlock on: ceremony, then the offline copies are re-sealed under the second layer. Refused unless
 * offline mode is on (there is nothing to protect otherwise). Clears the persisted API copy (disposable).
 */
export async function enablePasskeyUnlock(userId: string): Promise<PasskeyResult> {
  if (!isLocalWriteQueueEnabled()) return { ok: false, code: "offline_off" };
  const deviceId = await enrollDeviceId(userId);
  if (!deviceId) return { ok: false, code: "untrusted" };
  const r = await enrollPasskeySeal(userId, deviceId);
  if (r.ok) await wipePersistedDataCache(userId).catch(() => undefined);
  return r;
}

/**
 * Passkey ceremony, then the in-memory unlock secret for this page session. Finishes an interrupted enrolment and
 * wakes the offline queue. Use from a user gesture (the banner, the Settings card).
 */
export async function unlockWithPasskey(userId: string): Promise<PasskeyResult> {
  const r = await unlockRecord(userId);
  if (!r.ok) return r;
  const deviceId = await resolvePasskeyDeviceId(userId);
  if (deviceId) {
    await finishPasskeySeal(userId).catch((err) => console.warn("[local-first] passkey re-seal not finished", err));
  }
  resumeOfflineAfterPasskey(userId, deviceId);
  return r;
}

/**
 * Turns passkey unlock off: ceremony if needed, re-seal back to single, delete the record. Refused while queued writes
 * exist unless confirmed. With nothing queued and no trusted device, only the record is removed.
 */
export async function disablePasskeyUnlock(userId: string, opts: { unsyncedCount: number; confirmed: boolean }): Promise<PasskeyResult> {
  const deviceId = await resolvePasskeyDeviceId(userId);
  if (!deviceId) {
    if (opts.unsyncedCount > 0) return { ok: false, code: "untrusted" };
    return disableRecord(userId, { unsyncedCount: 0, confirmed: true });
  }
  return disablePasskeySeal(userId, deviceId, opts);
}

/**
 * Recovery when the passkey is lost: deletes this user's offline copies on this device (outbox, snapshot, device key)
 * and the passkey record. No ceremony, because nothing could be opened without one. The server keeps everything it
 * has already synced. Unsynced changes are lost: the caller asks first.
 */
export async function forgetPasskeyAndDiscardOffline(userId: string): Promise<PasskeyResult> {
  stopLocalWriteQueue();
  try {
    await disposeReadCache();
    await wipeOutboxUser(userId);
    await wipeReadCacheUser(userId);
    await wipePasskeyUnlock(userId);
  } catch {
    return { ok: false, code: "failed" };
  }
  await wipePersistedDataCache(userId).catch(() => undefined);
  const deviceId = await resolvePasskeyDeviceId(userId);
  if (deviceId && isLocalWriteQueueEnabled()) startLocalWriteQueue(userId, deviceId);
  return { ok: true };
}

export interface PasskeyLockState {
  /** A passkey record exists for the signed-in user (this browser). */
  enabled: boolean;
  /** enabled and this page holds no unlock secret: the offline copies cannot be used yet. */
  locked: boolean;
  userId: string | null;
  unlock: () => Promise<PasskeyResult>;
}

/** Live passkey lock state for the signed-in user. Never opens the server; reads the local record only. */
export function usePasskeyLock(): PasskeyLockState {
  const [userId, setUserId] = useState<string | null>(() => getSessionInfo()?.userId ?? null);
  const [, bump] = useState(0);
  useEffect(() => {
    const offSession = onSessionInfo((i) => setUserId(i?.userId ?? null));
    const offLock = onPasskeyLockChange(() => bump((n) => n + 1));
    return () => {
      offSession();
      offLock();
    };
  }, []);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void refreshPasskeyLock(userId).then(() => {
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  const enabled = userId !== null && passkeyEnrolledHint(userId) === true;
  const locked = userId !== null && passkeyLockedNow(userId);
  return {
    enabled,
    locked,
    userId,
    unlock: () => (userId ? unlockWithPasskey(userId) : Promise.resolve({ ok: false, code: "not_enabled" } as PasskeyResult)),
  };
}
