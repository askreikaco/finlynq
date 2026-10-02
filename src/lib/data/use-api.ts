"use client";

/**
 * useApi — the one way screens read the REST API (performance plan, Phase 1).
 *
 *   const { data, error, isLoading, mutate } = useApi<Account[]>("/api/accounts");
 *
 * - Key = the request URL (src/lib/swr convention); pass `null` to skip (e.g. until
 *   a dependency is known).
 * - Cached app-wide: revisiting a screen paints the cached value at once and
 *   revalidates in the background; identical requests within 2s share one fetch.
 * - `soft: fallback` resolves the fallback on a non-2xx / network error instead of
 *   throwing (for optional widgets that used `r.ok ? r.json() : default`).
 * - After a write, call nothing: successful writes refresh mounted keys
 *   (write-revalidation.ts). Call `mutate()` only to refresh this key on demand.
 */
import useSWR, { preload, type SWRConfiguration, type SWRResponse } from "swr";
import { jsonFetcher, softJsonFetcher } from "@/lib/swr";

export function useApi<T>(
  key: string | null,
  opts?: SWRConfiguration<T> & { soft?: T },
): SWRResponse<T> {
  const { soft, ...config } = opts ?? {};
  const fetcher = soft !== undefined ? softJsonFetcher<T>(soft) : (jsonFetcher as (url: string) => Promise<T>);
  return useSWR<T>(key, fetcher, config);
}

/** Warm a key before navigation (hover / touchstart on a link). */
export function prefetchApi(key: string): void {
  void preload(key, jsonFetcher);
}
