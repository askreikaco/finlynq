"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Per-device opt-in for the wide-screen split (list | detail) transactions view. Default off. */
export const SPLIT_VIEW_STORAGE_KEY = "finlynq.txSplitView";

/** Set only when storage is blocked, so the choice still lasts until reload. */
let memoryValue: boolean | null = null;

export function readSplitView(): boolean {
  try {
    return window.localStorage.getItem(SPLIT_VIEW_STORAGE_KEY) === "1";
  } catch {
    return memoryValue ?? false;
  }
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSplitView(): [boolean, (on: boolean) => void] {
  // Server snapshot is always off, so server and first client render agree.
  const on = useSyncExternalStore(subscribe, readSplitView, () => false);
  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(SPLIT_VIEW_STORAGE_KEY, next ? "1" : "0");
      memoryValue = null;
    } catch {
      memoryValue = next;
    }
    listeners.forEach((l) => l());
  }, []);
  return [on, set];
}
