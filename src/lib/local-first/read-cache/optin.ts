/**
 * Opt-in switch for the local read cache (local-first L2a, on-device snapshot L2b). Default OFF.
 * Per-browser only: a localStorage key, never sent to the server. SSR-safe: no storage on the server.
 * Turning it off (setLocalReadCacheEnabled(false)) drops the memory store and deletes every on-device snapshot.
 */
import { disposeReadCache } from "./session";
import { wipeAll } from "./persist-store";

export const LOCAL_READ_CACHE_KEY = "finlynq.lf.read";

export interface OptInStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): OptInStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    // Accessing localStorage can throw (blocked site data, sandboxed frames).
    return null;
  }
}

/** True only when the key is exactly "1". Any read failure means OFF. */
export function isLocalReadCacheEnabled(storage: OptInStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(LOCAL_READ_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Sets or clears the opt-in. Write failures are swallowed; the flag then stays at its previous value.
 * Switching OFF wipes every on-device read-cache database on this browser (fire-and-forget, never throws).
 */
export function setLocalReadCacheEnabled(on: boolean, storage: OptInStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    if (on) storage.setItem(LOCAL_READ_CACHE_KEY, "1");
    else storage.removeItem(LOCAL_READ_CACHE_KEY);
  } catch {
    // Quota or blocked storage: the flag did not change, so nothing is wiped.
    return;
  }
  if (!on) void wipeOnOptOut();
}

async function wipeOnOptOut(): Promise<void> {
  try {
    await disposeReadCache();
    await wipeAll();
  } catch (err) {
    console.warn("[local-first] read-cache wipe on opt-out failed", err);
  }
}
