"use client";

/**
 * Per-user localStorage (multi-account safe).
 *
 * Rules:
 * - Per-user keys are ALWAYS `${base}:${userId}`. There is no un-namespaced
 *   fallback: without a known userId nothing is read and nothing is written
 *   (a null userId must never alias another user's data, and the previous
 *   user's data must not flash before the session resolves).
 * - Legacy un-namespaced per-user keys (pre multi-account) are DROPPED, never
 *   migrated: a bare key cannot be attributed to a user, so copying it to
 *   whoever is logged in would leak A's data into B.
 * - Device-level keys (pf-font, pf-density, pf-sidebar-collapsed, analytics consent) are
 *   not per-user and are not listed here.
 */

import { useEffect, useState } from "react";

/** Per-user localStorage bases. Stored as `${base}:${userId}`. */
export const PER_USER_STORAGE_KEYS = [
  "pf-chat-history",
  "pf-dismissed-tips",
  "pf-spotlight-dismissed",
  "pf-view-mode", // G2-08: JSON { "<viewKey>:<sizeClass>": "cards" | "list" }
] as const;

/** Old un-namespaced per-user keys, removed on sight (see header). */
export const LEGACY_UNSCOPED_KEYS = [
  ...PER_USER_STORAGE_KEYS,
  "pf-tx-cols-v1", // now server-side only (/api/settings/tx-columns)
] as const;

export function userStorageKey(base: string, userId: string): string {
  return `${base}:${userId}`;
}

export function readUserItem(base: string, userId: string | null): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(userStorageKey(base, userId));
  } catch {
    return null;
  }
}

/** Returns false when skipped (no userId) or the write failed (quota/blocked). */
export function writeUserItem(base: string, userId: string | null, value: string): boolean {
  if (!userId) return false;
  try {
    localStorage.setItem(userStorageKey(base, userId), value);
    return true;
  } catch {
    return false;
  }
}

export function removeUserItem(base: string, userId: string | null): void {
  if (!userId) return;
  try {
    localStorage.removeItem(userStorageKey(base, userId));
  } catch {
    // ignore
  }
}

/** Remove the un-namespaced legacy per-user keys. Safe to call any time. */
export function dropLegacyUnscopedKeys(): void {
  try {
    for (const k of LEGACY_UNSCOPED_KEYS) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/**
 * Active user id from /api/auth/session. `ready` flips true once the answer is
 * in (userId stays null if signed out / request failed). Callers must not read
 * per-user storage until `ready && userId`. Also drops legacy bare keys.
 */
export function useSessionUserId(): { userId: string | null; ready: boolean } {
  const [state, setState] = useState<{ userId: string | null; ready: boolean }>({
    userId: null,
    ready: false,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let userId: string | null = null;
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          userId = typeof data?.userId === "string" && data.userId ? data.userId : null;
        }
      } catch {
        // signed-out / offline: userId stays null
      }
      if (cancelled) return;
      dropLegacyUnscopedKeys();
      setState({ userId, ready: true });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
