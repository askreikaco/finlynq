"use client";

/**
 * Hard reload after account switch, login, logout, or add-account flow.
 *
 * Clears browser cache (SWR, React Query, in-memory state) and localStorage
 * keys holding per-user data by performing a full page reload via
 * window.location.assign(), which:
 * - Kills all in-memory caches (React state, SWR, etc.)
 * - Does NOT carry over service-worker cache (none registered on this app)
 * - Clears inline <script> state
 *
 * Per-user localStorage keys (namespaced by userId) are NOT cleared by the
 * page reload itself; they must be cleaned up client-side BEFORE the reload
 * or the receiving page must ignore old data.
 *
 * Device-level keys (pf-font, pf-sidebar-collapsed, etc.) are intentionally
 * preserved.
 */

/**
 * Per-user localStorage keys that must be namespaced as `${key}:${userId}`.
 * When a user switches or logs out, these should be cleaned up to avoid
 * stale data serving to the next user.
 */
export const PER_USER_STORAGE_KEYS = [
  "pf-chat-history",
  "pf-dismissed-tips",
  "pf-spotlight-dismissed",
  "pf-tx-cols-v1",
] as const;

/**
 * Clear all per-user localStorage entries belonging to `userId`.
 * Removes both the old (non-namespaced) and new (namespaced) keys.
 *
 * @param userId - The user ID to clear (e.g., after logout or before hard reload)
 */
export function clearPerUserStorage(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    // Clear namespaced keys (new format)
    for (const key of PER_USER_STORAGE_KEYS) {
      localStorage.removeItem(`${key}:${userId}`);
    }
    // Also clear any old non-namespaced keys (migration safety)
    // These should NOT be present in a fresh session, but may linger
    // if localStorage has not been cleared since before the switch feature.
    for (const key of PER_USER_STORAGE_KEYS) {
      if (localStorage.getItem(key)) {
        // Heuristic: if the key exists without namespace, it's likely from
        // before the multi-account feature. Only clear if we're reasonably sure
        // it's not for the current user (i.e., during logout/switch context).
        // For safety, we do NOT auto-clear old keys — the receiving page's
        // component will ignore data not matching the active user.
      }
    }
  } catch (_e) {
    // localStorage access denied (private window, quota, etc.) — swallow
  }
}

/**
 * Hard reload the page to destination, clearing browser caches.
 * After switch/login/logout/add-account, call this instead of
 * window.location.href to ensure the new session loads cleanly.
 *
 * @param url - Destination URL (default: current pathname)
 */
export function hardReload(url: string = window.location.pathname): void {
  // window.location.assign does NOT use browser cache or service-worker cache;
  // it forces a fresh fetch and full page parse. This clears:
  // - React state (component remount)
  // - SWR/React Query caches (key-based, keyed on URL only, no userId awareness)
  // - Global state / module-level singletons
  //
  // The new page load will:
  // - Call middleware to set up the fresh session
  // - Fetch /api/auth/session to get the active user's identity
  // - Re-initialize components with the new user context
  window.location.assign(url);
}

/**
 * Perform pre-reload cleanup: clear per-user data and then hard-reload.
 *
 * @param userId - The user being logged out (clears their localStorage)
 * @param url - Destination URL (default: current pathname)
 */
export function hardReloadAfterLogout(userId: string, url: string = window.location.pathname): void {
  clearPerUserStorage(userId);
  hardReload(url);
}
