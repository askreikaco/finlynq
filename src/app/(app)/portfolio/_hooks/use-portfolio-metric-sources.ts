"use client";

import { useMemo } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";

type Envelope<T> = { success?: boolean; data?: T };

/**
 * Monthly history behind the /portfolio summary cards (all cache-first, so the cards also work offline):
 * the daily value/cost snapshots, every dividend row and every closed lot. A source that fails to load is null
 * and its cards show their value only.
 */
export function usePortfolioMetricSources(displayCurrency: string, currencyLoading = false) {
  const off = currencyLoading;
  const perf = useCacheFirstJson<Envelope<{ currency: string; series: Array<{ date: string; marketValue: number; costBasis: number }> }>>(
    off ? null : "/api/portfolio/performance?period=all",
  );
  const divs = useCacheFirstJson<Envelope<{ rows?: Array<{ date: string; reportingAmount: number | null; reportingCurrency: string | null }> }>>(
    off ? null : "/api/portfolio/dividends",
  );
  const gains = useCacheFirstJson<Envelope<{ rows?: Array<{ closeDate: string; realizedGainInBase?: number | null }> }>>(
    off ? null : "/api/portfolio/realized-gains?unified=1&term=all",
  );
  return useMemo(
    () => ({
      perf: perf.data?.success && perf.data.data ? perf.data.data : null,
      dividends: divs.data?.success && divs.data.data?.rows ? divs.data.data.rows : null,
      gains: gains.data?.success && gains.data.data?.rows ? gains.data.data.rows : null,
      displayCurrency,
    }),
    [perf.data, divs.data, gains.data, displayCurrency],
  );
}
