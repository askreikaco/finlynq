/**
 * Wipe triggers for the opt-in on-device read cache (local-first L2b), called from the data layer and
 * the auth/account UI next to the existing SWR-cache wipes.
 *
 * Every helper is fire-and-forget: it never throws and never rejects (failures go to console.warn).
 * Each helper first drops the in-memory store (a no-op when none is open). Offline mode is ON by default, so the
 * wipes gate on "not explicitly turned off" (tri-state, see opt-state.ts): a default-on user is wiped like an opted-in
 * one, and a user who turned it off ("0") gets no IndexedDB work here, because opting out already wiped it.
 *
 * Lives under src/lib/data (not under src/components or src/app) so app code never names the
 * local-first package directly (tests/local-first/inventory-absence.test.ts).
 */
import { isLocalReadCacheEnabled } from "@/lib/local-first/read-cache/optin";
import { wipeAll, wipeAllSnapshots, wipeSnapshotData, wipeUser } from "@/lib/local-first/read-cache/persist-store";
import { disposeReadCache } from "@/lib/local-first/read-cache/session";
import { isLocalWriteKeySet } from "@/lib/local-first/write-path/flag";
import { stopLocalWriteQueue } from "./local-write-queue";
import { wipeAllOutboxes, wipeOutboxUser } from "@/lib/local-first/write-path/outbox-store";
import { forgetOfflineIdentity } from "./offline-identity";
import { wipeAllPasskeyUnlocks, wipePasskeyUnlock } from "@/lib/local-first/crypto/passkey-unlock";

/**
 * LOCK (idle lock, server DEK locked (423), tab restore): drops only the DISPOSABLE copies (the read-cache snapshot and the
 * in-memory store). The encrypted outbox and the device key are KEPT: unsynced offline writes exist nowhere else. The
 * scheduler stops while locked; startLocalWriteQueue on unlock resumes draining the kept entries.
 */
export async function dropLocalDisposableCaches(userId: string): Promise<void> {
  forgetOfflineIdentity();
  try {
    stopLocalWriteQueue(); // no sends while locked; the outbox itself is not touched
    await disposeReadCache();
    if (isLocalReadCacheEnabled()) await wipeSnapshotData(userId); // snapshot only: the device key stays for the outbox
  } catch (err) {
    console.warn("[local-first] disposable cache wipe failed", err);
  }
}

/**
 * LOGOUT, untrusted device, account data deletion: drops this user's snapshot, device key AND outbox. Unsynced writes
 * are discarded here by design (the account is leaving this device). Never call this for a lock.
 */
export async function dropLocalUserCache(userId: string): Promise<void> {
  forgetOfflineIdentity();
  try {
    stopLocalWriteQueue(); // scheduler off before the outbox is deleted
    await disposeReadCache();
  } catch (err) {
    console.warn("[local-first] read-cache wipe failed", err);
  }
  // Each step separately: an outbox that is blocked must not keep the snapshot and device key around.
  try {
    // Offline write queue (L3): touched unless the user explicitly turned it off ("0"), so a default-on outbox is never orphaned.
    if (isLocalWriteKeySet()) await wipeOutboxUser(userId);
  } catch (err) {
    console.warn("[local-first] outbox wipe failed", err);
  }
  try {
    if (!isLocalReadCacheEnabled() && !isLocalWriteKeySet()) return;
    await wipeUser(userId);
  } catch (err) {
    console.warn("[local-first] read-cache wipe failed", err);
  }
}

/** Deletes every on-device snapshot and device key on this browser (signed-out boot, password reset, account deletion). */
export async function dropAllLocalCaches(): Promise<void> {
  forgetOfflineIdentity();
  try {
    stopLocalWriteQueue();
    await wipeAllPasskeyUnlocks(); // passkey wrap (flag-independent: a leftover record must not survive a signed-out boot)
    await disposeReadCache();
    if (isLocalWriteKeySet()) await wipeAllOutboxes();
    if (!isLocalReadCacheEnabled() && !isLocalWriteKeySet()) return;
    await wipeAll();
  } catch (err) {
    console.warn("[local-first] read-cache wipe failed", err);
  }
}

/**
 * SIGNED-OUT BOOT with no explicit sign-out (expired or unauthenticated session). Wipes every user's DISPOSABLE copies
 * (read-cache snapshots, remembered identity and currency). KEEPS every user's encrypted outbox and per-user device key:
 * unsynced writes stay encrypted on this device until that same account signs in again. Only an explicit sign-out
 * (dropLocalUserCache via clearPerUserStorage), untrust, account deletion and reset-password remove outboxes.
 */
export async function dropSignedOutDisposableCaches(): Promise<void> {
  forgetOfflineIdentity();
  try {
    stopLocalWriteQueue(); // no sends while signed out; outboxes and device keys are not touched
    await disposeReadCache();
    await wipeAllSnapshots();
  } catch (err) {
    console.warn("[local-first] signed-out disposable cache wipe failed", err);
  }
}

/** dropAllLocalCaches, but resolves after at most `ms` so a page about to navigate away still gets a head start. */
export function dropAllLocalCachesWithin(ms: number): Promise<void> {
  return Promise.race([dropAllLocalCaches(), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

/**
 * Deletes one user's passkey unlock wrap (logout, remove account). Deliberately NOT called from dropLocalUserCache:
 * that also runs on lock, and a lock must keep the passkey so it can unlock again. Never throws.
 */
export async function dropPasskeyUnlockFor(userId: string): Promise<void> {
  try {
    await wipePasskeyUnlock(userId);
  } catch (err) {
    console.warn("[local-first] passkey unlock wipe failed", err);
  }
}
