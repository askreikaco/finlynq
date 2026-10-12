"use client";

/**
 * useCacheFirstJson (local-first L2, read path): one GET, painted from the on-device cache first.
 *
 * Flag OFF (default; localStorage "finlynq.lf.read" !== "1"): exactly the old behaviour — one plain fetch per url,
 * no SWR key, no cache. Flag ON: the same url goes through useApi, so a revisit (or an offline open on a trusted,
 * unlocked device, where the SWR cache is persisted encrypted) paints the last data at once and revalidates in the
 * background. A failed revalidation never hides data that is already on screen.
 * Pass `null` to skip (e.g. until a dependency is known). `keepPrevious` keeps showing the last data while the next
 * url loads (e.g. a display-currency switch) instead of dropping back to the loading state.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useApi } from "./use-api";
import { isLocalReadCacheEnabled, LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

export interface CacheFirstJson<T> {
  data: T | undefined;
  /** True only while there is nothing to show yet. */
  loading: boolean;
  /** True only when the request failed AND there is no data to show. */
  error: boolean;
  reload: () => void;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === LOCAL_READ_CACHE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

type Legacy<T> = { url: string; data?: T; failed: boolean };

export function useCacheFirstJson<T>(url: string | null, opts: { keepPrevious?: boolean } = {}): CacheFirstJson<T> {
  // Server snapshot is always OFF, so server and first client render agree.
  const on = useSyncExternalStore(subscribe, () => isLocalReadCacheEnabled(), () => false);

  const swr = useApi<T>(on ? url : null, { keepPreviousData: !!opts.keepPrevious });

  const [legacy, setLegacy] = useState<Legacy<T> | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (on || !url) return;
    let alive = true;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`GET ${url} ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then((d) => {
        if (alive) setLegacy({ url, data: d, failed: false });
      })
      .catch(() => {
        if (alive) setLegacy({ url, failed: true });
      });
    return () => {
      alive = false;
    };
  }, [on, url, tick]);

  const swrMutate = swr.mutate;
  const reload = useCallback(() => {
    if (on) void swrMutate();
    else {
      setLegacy(null);
      setTick((t) => t + 1);
    }
  }, [on, swrMutate]);

  if (!url) return { data: undefined, loading: false, error: false, reload };
  if (on) {
    const has = swr.data !== undefined;
    return { data: swr.data, loading: !has && !swr.error, error: !has && !!swr.error, reload };
  }
  if (opts.keepPrevious && legacy && legacy.url !== url && legacy.data !== undefined) {
    return { data: legacy.data, loading: false, error: false, reload };
  }
  const mine = legacy && legacy.url === url ? legacy : null;
  return {
    data: mine?.data,
    loading: !mine,
    error: !!mine?.failed,
    reload,
  };
}
