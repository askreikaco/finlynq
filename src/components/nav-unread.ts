"use client";

/**
 * Unread counts behind the nav badges: announcements (What's new) and feedback replies (Feedback).
 * One module-level store, so AppTabs and the More screen share one fetch per navigation instead
 * of each asking for the same two endpoints. Refetches when the pathname changes, the same as the
 * old per-link sidebar badges; the first consumer to mount after an empty store always loads.
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

export interface NavUnread {
  /** null until the announcements response arrives, or when it failed (callers then keep What's new visible). */
  announcements: Array<{ id?: number; read?: boolean }> | null;
  announcementsUnread: number;
  feedbackUnread: number;
}

const EMPTY: NavUnread = { announcements: null, announcementsUnread: 0, feedbackUnread: 0 };

let state: NavUnread = EMPTY;
const listeners = new Set<() => void>();
let loadedFor: string | null = null;

function subscribe(listener: () => void): () => void {
  // First consumer after an empty store: forget the last path so it loads again.
  if (listeners.size === 0) loadedFor = null;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): NavUnread {
  return state;
}

function load(pathname: string): void {
  if (loadedFor === pathname) return;
  loadedFor = pathname;
  const announcements = fetch("/api/announcements")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const feedback = fetch("/api/feedback")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  void Promise.all([announcements, feedback]).then(([ann, fb]) => {
    const list = Array.isArray(ann) ? (ann as NavUnread["announcements"]) : null;
    const threads = Array.isArray(fb) ? (fb as Array<{ unread?: boolean }>) : [];
    state = {
      announcements: list,
      announcementsUnread: list ? list.filter((a) => !a.read).length : 0,
      feedbackUnread: threads.filter((t) => t.unread).length,
    };
    listeners.forEach((l) => l());
  });
}

/** Unread counts for the current route. Safe to call from several components on one page. */
export function useNavUnread(): NavUnread {
  const pathname = usePathname() ?? "";
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    load(pathname);
  }, [pathname]);
  return snapshot;
}
