"use client";

/**
 * Portfolio-page data hooks (FINLYNQ-118 Phase 3; read path moved to useCacheFirstJson, local-first L2).
 *
 * Same fetch URLs and triggers as before (displayCurrency for overview; period + enabled for benchmarks). With the
 * local read cache off (default) the hook makes the same plain fetch; with it on the data paints from the on-device
 * cache first. A failed load clears `loading` and leaves the data empty, as before.
 */

import { useMemo } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import type { BenchmarkData, OverviewData } from "../_types";

/**
 * Fetch portfolio overview — re-runs when display currency changes so
 * totals + currency-as-holding prices reflect the user's choice.
 *
 * `reload()` is the imperative refetch the holding edit/create dialog calls
 * on save.
 */
export function usePortfolioOverview(displayCurrency: string) {
  const res = useCacheFirstJson<OverviewData>(
    `/api/portfolio/overview?currency=${encodeURIComponent(displayCurrency)}`,
    { keepPrevious: true },
  );
  return { data: res.data ?? null, loading: res.loading, reload: res.reload };
}

/**
 * Fetch benchmarks (dev mode only). The `enabled` gate mirrors the inline
 * `if (!devMode) return` early-out — when false nothing is requested and
 * the series stays empty.
 */
export function useBenchmarks(period: string, enabled: boolean) {
  const res = useCacheFirstJson<{ benchmarks?: BenchmarkData[] }>(
    enabled ? `/api/portfolio/benchmarks?period=${period}` : null,
  );
  const benchmarks = useMemo(() => res.data?.benchmarks ?? [], [res.data]);
  return { benchmarks, benchmarkLoading: res.loading };
}
