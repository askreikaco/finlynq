/**
 * Switch for the offline write queue (local-first L3). ON by default (opt-out model).
 * Per-browser only (localStorage key, never sent to the server). Tri-state storage rules: see ../opt-state.ts.
 * Requires the read-cache switch too: the queue only works with the device key and caches that switch already owns.
 */
import { wipeAllOutboxes } from "./outbox-store";
import { isLocalReadCacheEnabled } from "../read-cache/optin";
import { defaultOptStorage, readOptIn, readOptInState, writeOptIn, type OptInState, type OptInStorage } from "../opt-state";

export const LOCAL_WRITE_QUEUE_KEY = "finlynq.lf.write";

/**
 * Set when the device key cannot be used at runtime (see local-write-queue.ts). Silently keeps the queue OFF for the rest
 * of this page session. Never persisted, so the next page load tries again.
 */
let unavailableThisSession = false;

/** Latches the queue OFF for this page session after a runtime failure. No error is shown to the user. */
export function markOfflineQueueUnavailable(): void {
  unavailableThisSession = true;
}

/** True when the write switch is not "0", the read-cache switch is on, the device supports it and no runtime failure latched it off. */
export function isLocalWriteQueueEnabled(storage: OptInStorage | null = defaultOptStorage()): boolean {
  return !unavailableThisSession && readOptIn(storage, LOCAL_WRITE_QUEUE_KEY) && isLocalReadCacheEnabled(storage);
}

/**
 * Tri-state of the write switch alone ("default" | "on" | "off"), ignoring device support. Used by the wipe triggers:
 * anything but an explicit "0" counts, so a user's outbox is never orphaned.
 */
export function isLocalWriteKeySet(storage: OptInStorage | null = defaultOptStorage()): boolean {
  return readOptIn(storage, LOCAL_WRITE_QUEUE_KEY);
}

/** Where the write switch comes from (for the Settings card): "default", "on" or "off". */
export function localWriteQueueState(storage: OptInStorage | null = defaultOptStorage()): OptInState {
  return readOptInState(storage, LOCAL_WRITE_QUEUE_KEY);
}

/** Sets the choice: true writes "1", false writes "0" and deletes every on-device outbox (queued, unsent writes are lost). */
export function setLocalWriteQueueEnabled(on: boolean, storage: OptInStorage | null = defaultOptStorage()): void {
  if (!writeOptIn(storage, LOCAL_WRITE_QUEUE_KEY, on)) return; // flag did not change: nothing to wipe
  if (!on) void wipeAllOutboxes().catch((err) => console.warn("[local-first] outbox wipe on opt-out failed", err));
}
