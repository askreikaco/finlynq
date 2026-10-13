/**
 * Shared tri-state reader for the on-device offline flags (local-first). Opt-OUT model: ON by default.
 *
 * Per browser, localStorage only, never sent anywhere. Stored value per key:
 *   absent          -> "default"  ON (the default for every signed-in user)
 *   "1"             -> "on"       ON (written when the user turns it on)
 *   "0"             -> "off"      OFF (written when the user turns it off; survives reloads, so the default never re-enables it)
 *   any other value -> "on"       (only "0" means OFF)
 * No storage, or a storage read that throws (private mode, blocked site data, sandboxed frame), is OFF: fail closed.
 *
 * Every flag reads and writes through these helpers; no other code compares the raw value.
 */
export const OPT_IN_VALUE = "1";
export const OPT_OUT_VALUE = "0";

export interface OptInStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type OptInState = "default" | "on" | "off";

/** window.localStorage, or null on the server or when access throws (blocked site data, sandboxed frames). */
export function defaultOptStorage(): OptInStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Tri-state read of one key. See the header for the table. */
export function readOptInState(storage: OptInStorage | null, key: string): OptInState {
  if (!storage) return "off";
  try {
    const v = storage.getItem(key);
    if (v === null) return "default";
    return v === OPT_OUT_VALUE ? "off" : "on";
  } catch {
    return "off";
  }
}

/** True unless the stored value is exactly "0" (or storage is unavailable). Does not check device support. */
export function readOptIn(storage: OptInStorage | null, key: string): boolean {
  return readOptInState(storage, key) !== "off";
}

/** Writes an explicit choice ("1" on, "0" off; never removes the key). False when the write failed: the flag keeps its old value. */
export function writeOptIn(storage: OptInStorage | null, key: string, on: boolean): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, on ? OPT_IN_VALUE : OPT_OUT_VALUE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Device can hold offline data: IndexedDB + WebCrypto subtle. Same test as persistSupported() in lib/data/persist.ts,
 * kept local so this flag does not depend on that module. AES-GCM itself cannot be probed synchronously; if the device
 * key cannot be created at runtime, the write queue latches OFF for the session (see write-path/flag.ts).
 */
export function offlineStorageSupported(): boolean {
  try {
    return typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle;
  } catch {
    return false;
  }
}
