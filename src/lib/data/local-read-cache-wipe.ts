/**
 * Wipe triggers for the opt-in on-device read cache (local-first L2b), called from the data layer and
 * the auth/account UI next to the existing SWR-cache wipes.
 *
 * Every helper is fire-and-forget: it never throws and never rejects (failures go to console.warn).
 * Each helper first drops the in-memory store (a no-op when none is open). It touches IndexedDB only
 * when the opt-in is on, so with the opt-in off these calls do no IndexedDB work at all.
 *
 * Lives under src/lib/data (not under src/components or src/app) so app code never names the
 * local-first package directly (tests/local-first/inventory-absence.test.ts).
 */
import { isLocalReadCacheEnabled } from "@/lib/local-first/read-cache/optin";
import { wipeAll, wipeUser } from "@/lib/local-first/read-cache/persist-store";
import { disposeReadCache } from "@/lib/local-first/read-cache/session";
import { isLocalWriteKeySet } from "@/lib/local-first/write-path/flag";
import { stopLocalWriteQueue } from "./local-write-queue";
import { wipeAllOutboxes, wipeOutboxUser } from "@/lib/local-first/write-path/outbox-store";

/** Deletes one user's on-device snapshot and device key (lock, untrusted device, logout, session end). */
export async function dropLocalUserCache(userId: string): Promise<void> {
  try {
    stopLocalWriteQueue(); // scheduler off before the outbox is deleted
    await disposeReadCache();
    // Offline write queue (L3): only touched when its own opt-in key is set, so flag-off does no IndexedDB work.
    if (isLocalWriteKeySet()) await wipeOutboxUser(userId);
    if (!isLocalReadCacheEnabled() && !isLocalWriteKeySet()) return;
    await wipeUser(userId);
  } catch (err) {
    console.warn("[local-first] read-cache wipe failed", err);
  }
}

/** Deletes every on-device snapshot and device key on this browser (signed-out boot, password reset, account deletion). */
export async function dropAllLocalCaches(): Promise<void> {
  try {
    stopLocalWriteQueue();
    await disposeReadCache();
    if (isLocalWriteKeySet()) await wipeAllOutboxes();
    if (!isLocalReadCacheEnabled() && !isLocalWriteKeySet()) return;
    await wipeAll();
  } catch (err) {
    console.warn("[local-first] read-cache wipe failed", err);
  }
}

/** dropAllLocalCaches, but resolves after at most `ms` so a page about to navigate away still gets a head start. */
export function dropAllLocalCachesWithin(ms: number): Promise<void> {
  return Promise.race([dropAllLocalCaches(), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}
