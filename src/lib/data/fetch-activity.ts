"use client";

/**
 * Which API keys are mounted on screen and which of them are fetching right now.
 *
 * useApi reports every mounted key here. The page Refresh button (components/refresh-button.tsx) reads it to
 * (a) revalidate exactly the keys of the current page and (b) spin only while one of them is fetching.
 * Module state, no React context: the keys live in the one SWR cache, this only counts hooks.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { noteWrite } from "@/lib/swr/http-freshness";

const mounted = new Map<string, number>(); // key -> mounted hook count
const revalidators = new Map<symbol, { key: string; mutate: () => unknown }>(); // one per mounted hook: provider-bound mutate
const validating = new Map<string, number>(); // key -> hooks currently validating
const legacyReloaders = new Map<symbol, () => void>(); // flag-off (plain fetch) readers: they have no SWR key
const legacyBusy = new Set<symbol>();
const listeners = new Set<() => void>();
let fetching = false;

function recompute(): void {
  let next = false;
  for (const n of validating.values()) if (n > 0) next = true;
  if (legacyBusy.size > 0) next = true;
  if (next === fetching) return;
  fetching = next;
  listeners.forEach((l) => l());
}

function bump(map: Map<string, number>, key: string, by: number): void {
  const n = (map.get(key) ?? 0) + by;
  if (n <= 0) map.delete(key);
  else map.set(key, n);
}

/** Called by useApi on every render of a hook with a key. */
export function useFetchActivity(key: string | null, isValidating: boolean, mutate?: () => unknown): void {
  const mutateRef = useRef(mutate);
  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);
  useEffect(() => {
    if (!key) return;
    bump(mounted, key, 1);
    const id = Symbol("swr-hook");
    revalidators.set(id, { key, mutate: () => mutateRef.current?.() });
    return () => {
      bump(mounted, key, -1);
      revalidators.delete(id);
      recompute();
    };
  }, [key]);
  useEffect(() => {
    if (!key || !isValidating) return;
    bump(validating, key, 1);
    recompute();
    return () => {
      bump(validating, key, -1);
      recompute();
    };
  }, [key, isValidating]);
}

/** Plain-fetch readers (local read cache switched off): join the Refresh button without an SWR key. */
export function useLegacyFetchActivity(active: boolean, busy: boolean, reload: () => void): void {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  useEffect(() => {
    if (!active) return;
    const id = Symbol("legacy-fetch");
    legacyReloaders.set(id, () => reloadRef.current());
    if (busy) legacyBusy.add(id);
    recompute();
    return () => {
      legacyReloaders.delete(id);
      legacyBusy.delete(id);
      recompute();
    };
  }, [active, busy]);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** True while any mounted key is fetching. */
export function useIsFetching(): boolean {
  return useSyncExternalStore(subscribe, () => fetching, () => false);
}

/** Keys with a mounted hook (the current page + layout). */
export function mountedApiKeys(): string[] {
  return Array.from(mounted.keys());
}

/**
 * Revalidate every key that has a mounted hook (plain-fetch readers reload too). Each hook's own `mutate` is bound to
 * the SWR cache it was created in, so this reaches the app's custom cache provider, which the global `mutate` of swr
 * (default cache only) cannot see. Keys nobody has mounted are left alone: they revalidate when next shown.
 */
export function revalidateMountedKeys(): Promise<unknown[]> {
  const seen = new Set<string>();
  const jobs: unknown[] = [];
  revalidators.forEach(({ key, mutate }) => {
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push(mutate());
  });
  legacyReloaders.forEach((r) => r());
  return Promise.all(jobs);
}

/**
 * Revalidate every mounted key now, bypassing the browser HTTP cache (same as after a write).
 * Uses the mutate bound to the app's SWR provider (the global one cannot see the provider's cache).
 */
export function useRefreshAll(): { refresh: () => Promise<void>; fetching: boolean } {
  const isFetching = useIsFetching();
  const refresh = async () => {
    noteWrite();
    await revalidateMountedKeys();
  };
  return { refresh, fetching: isFetching };
}

/** Test helper. */
export function resetFetchActivity(): void {
  mounted.clear();
  revalidators.clear();
  validating.clear();
  legacyReloaders.clear();
  legacyBusy.clear();
  fetching = false;
}
