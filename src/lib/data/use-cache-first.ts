"use client";

/**
 * useCacheFirstJson (local-first L2, read path): one GET, painted from the on-device cache first.
 *
 * Flag OFF (the user turned it off: localStorage "finlynq.lf.read" === "0", or no device support): exactly the old
 * behaviour — one plain fetch per url, no SWR key, no cache. Flag ON (default for every signed-in user): the same url goes through useApi, so a revisit (or an offline open on a trusted,
 * unlocked device, where the SWR cache is persisted encrypted) paints the last data at once and revalidates in the
 * background. A failed revalidation never hides data that is already on screen.
 * Pass `null` to skip (e.g. until a dependency is known). `keepPrevious` keeps showing the last data while the next
 * url loads (e.g. a display-currency switch) instead of dropping back to the loading state.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useApi } from "./use-api";
import { useLegacyFetchActivity } from "./fetch-activity";
import { isLocalReadCacheEnabled, LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

export interface CacheFirstJson<T> {
  data: T | undefined;
  /** True only while there is nothing to show yet. */
  loading: boolean;
  /** True only when the request failed AND there is no data to show. */
  error: boolean;
  /** HTTP status of the failed request (e.g. 404) when `error` is true; null for a network error or no error. */
  errorStatus: number | null;
  reload: () => void;
  /** Replace the data in place (optimistic write / server echo) without refetching. */
  setData: (next: T) => void;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === LOCAL_READ_CACHE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

type Legacy<T> = { url: string; data?: T; failed: boolean; status?: number | null };

export function useCacheFirstJson<T>(url: string | null, opts: { keepPrevious?: boolean } = {}): CacheFirstJson<T> {
  // Server snapshot is always OFF, so server and first client render agree.
  const on = useSyncExternalStore(subscribe, () => isLocalReadCacheEnabled(), () => false);

  const swr = useApi<T>(on ? url : null, { keepPreviousData: !!opts.keepPrevious });

  const [legacy, setLegacy] = useState<Legacy<T> | null>(null);
  const [tick, setTick] = useState(0);
  const [legacyBusy, setLegacyBusy] = useState(false);
  useEffect(() => {
    if (on || !url) return;
    let alive = true;
    setLegacyBusy(true);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw Object.assign(new Error(`GET ${url} ${r.status}`), { status: r.status });
        return r.json() as Promise<T>;
      })
      .then((d) => {
        if (alive) setLegacy({ url, data: d, failed: false });
      })
      .catch((e: unknown) => {
        const st = (e as { status?: unknown } | null)?.status;
        if (alive) setLegacy({ url, failed: true, status: typeof st === "number" ? st : null });
      })
      .finally(() => {
        if (alive) setLegacyBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [on, url, tick]);

  const swrMutate = swr.mutate;
  const reload = useCallback(() => {
    if (on) void swrMutate();
    else {
      // A refresh keeps the data on screen; only a retry after a failure goes back to the loading state.
      setLegacy((cur) => (cur?.failed ? null : cur));
      setTick((t) => t + 1);
    }
  }, [on, swrMutate]);
  useLegacyFetchActivity(!on && !!url, legacyBusy, reload);

  const setData = useCallback(
    (next: T) => {
      if (on) void swrMutate(next, { revalidate: false });
      else if (url) setLegacy({ url, data: next, failed: false });
    },
    [on, swrMutate, url],
  );

  if (!url) return { data: undefined, loading: false, error: false, errorStatus: null, reload, setData };
  if (on) {
    const has = swr.data !== undefined;
    const st = (swr.error as { status?: unknown } | undefined)?.status;
    const failed = !has && !!swr.error;
    return { data: swr.data, loading: !has && !swr.error, error: failed, errorStatus: failed && typeof st === "number" ? st : null, reload, setData };
  }
  if (opts.keepPrevious && legacy && legacy.url !== url && legacy.data !== undefined) {
    return { data: legacy.data, loading: false, error: false, errorStatus: null, reload, setData };
  }
  const mine = legacy && legacy.url === url ? legacy : null;
  return {
    data: mine?.data,
    loading: !mine,
    error: !!mine?.failed,
    errorStatus: mine?.failed ? (mine.status ?? null) : null,
    reload,
    setData,
  };
}
