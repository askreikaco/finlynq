import type { SWRConfiguration } from "swr";
import { jsonFetcher } from "@/lib/swr";

/**
 * App-wide SWR defaults (performance plan, Phase 1). Every read shows its cached
 * value at once and revalidates in the background; identical requests within 2s
 * share one fetch; paging / filter changes keep the previous data on screen.
 */
export const dataDefaults: SWRConfiguration = {
  fetcher: jsonFetcher,
  revalidateIfStale: true,
  revalidateOnFocus: true,
  // returning to the tab / resuming the home-screen app refreshes what is on screen,
  // at most every 30s
  focusThrottleInterval: 30_000,
  revalidateOnReconnect: true,
  dedupingInterval: 2_000,
  keepPreviousData: true,
  shouldRetryOnError: false,
};
