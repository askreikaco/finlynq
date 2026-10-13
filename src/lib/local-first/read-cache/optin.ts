/**
 * Switch for the local read cache (local-first L2a, on-device snapshot L2b). ON by default (opt-out model).
 * Per-browser only: a localStorage key, never sent to the server. SSR-safe: no storage on the server.
 * Tri-state storage rules: see ../opt-state.ts. Turning it off (setLocalReadCacheEnabled(false)) writes "0",
 * drops the memory store and deletes every on-device snapshot.
 */
import { disposeReadCache } from "./session";
import { wipeAll } from "./persist-store";
import { defaultOptStorage, offlineStorageSupported, readOptIn, readOptInState, writeOptIn, type OptInState, type OptInStorage } from "../opt-state";

export type { OptInStorage, OptInState } from "../opt-state";

export const LOCAL_READ_CACHE_KEY = "finlynq.lf.read";

/** True unless the user turned it off ("0") or storage is unavailable; also requires IndexedDB + WebCrypto. */
export function isLocalReadCacheEnabled(storage: OptInStorage | null = defaultOptStorage()): boolean {
  return readOptIn(storage, LOCAL_READ_CACHE_KEY) && offlineStorageSupported();
}

/** Where the read-cache flag comes from: "default" (never set), "on" (set by the user) or "off". Storage failure = "off". */
export function localReadCacheState(storage: OptInStorage | null = defaultOptStorage()): OptInState {
  return readOptInState(storage, LOCAL_READ_CACHE_KEY);
}

/**
 * Sets the choice: true writes "1", false writes "0" (the key is never removed, so the default cannot re-enable it).
 * Write failures are swallowed; the flag then keeps its previous value.
 * Switching OFF wipes every on-device read-cache database on this browser (fire-and-forget, never throws).
 */
export function setLocalReadCacheEnabled(on: boolean, storage: OptInStorage | null = defaultOptStorage()): void {
  if (!writeOptIn(storage, LOCAL_READ_CACHE_KEY, on)) return; // flag did not change, so nothing is wiped
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
