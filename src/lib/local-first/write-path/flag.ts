/**
 * Opt-in switch for the offline write queue (local-first L3). Default OFF.
 * Per-browser only (localStorage key, never sent to the server). Requires the read-cache opt-in too:
 * the queue only works with the device key and caches that opt-in already owns.
 */
import { wipeAllOutboxes } from "./outbox-store";
import { isLocalReadCacheEnabled, type OptInStorage } from "../read-cache/optin";

export const LOCAL_WRITE_QUEUE_KEY = "finlynq.lf.write";

function defaultStorage(): OptInStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** True only when the write key is exactly "1" AND the read-cache opt-in is on. Any read failure means OFF. */
export function isLocalWriteQueueEnabled(storage: OptInStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(LOCAL_WRITE_QUEUE_KEY) === "1" && isLocalReadCacheEnabled(storage);
  } catch {
    return false;
  }
}

/** True when the write key itself is set (ignores the read opt-in). Used by wipe triggers so a queue is never orphaned. */
export function isLocalWriteKeySet(storage: OptInStorage | null = defaultStorage()): boolean {
  try {
    return !!storage && storage.getItem(LOCAL_WRITE_QUEUE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sets or clears the write opt-in. Switching OFF deletes every on-device outbox (queued, unsent writes are lost). */
export function setLocalWriteQueueEnabled(on: boolean, storage: OptInStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    if (on) storage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    else storage.removeItem(LOCAL_WRITE_QUEUE_KEY);
  } catch {
    return; // flag did not change: nothing to wipe
  }
  if (!on) void wipeAllOutboxes().catch((err) => console.warn("[local-first] outbox wipe on opt-out failed", err));
}
