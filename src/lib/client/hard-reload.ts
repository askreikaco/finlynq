"use client";

/**
 * Full-page navigation after any account change (login, register, add
 * account, switch, logout). A full load discards every in-memory cache (React
 * state, SWR, module singletons) so nothing from the previous account can
 * render under the new one. router.push()+refresh() does NOT do that.
 *
 * Per-user localStorage is namespaced by userId (see user-storage.ts), so the
 * next account never reads the previous account's keys.
 */

import { PER_USER_STORAGE_KEYS, userStorageKey, dropLegacyUnscopedKeys } from "@/lib/client/user-storage";

export { PER_USER_STORAGE_KEYS };

/** Remove one user's namespaced per-user keys (+ legacy bare keys). */
export function clearPerUserStorage(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of PER_USER_STORAGE_KEYS) {
      localStorage.removeItem(userStorageKey(key, userId));
    }
  } catch {
    // localStorage blocked — ignore
  }
  dropLegacyUnscopedKeys();
}

/** Navigate with a full page load (default: reload the current path). */
export function hardReload(url: string = window.location.pathname): void {
  window.location.assign(url);
}

/** Clear the signed-out user's per-user storage, then hardReload. */
export function hardReloadAfterLogout(userId: string, url: string = "/"): void {
  clearPerUserStorage(userId);
  hardReload(url);
}
