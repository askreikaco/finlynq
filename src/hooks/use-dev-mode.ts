import { useCacheFirstJson } from "@/lib/data/use-cache-first";

/**
 * Returns the current dev mode state.
 * null = still loading (default to hiding dev features while loading)
 * true = dev mode on (show all features)
 * false = prod mode (hide dev-only features)
 * Cache-first: a remounted page gets the last known value on the first render (no flash of hidden dev cards).
 */
export function useDevMode(): boolean | null {
  const res = useCacheFirstJson<{ devMode?: boolean }>("/api/settings/dev-mode");
  if (res.data) return res.data.devMode ?? false;
  return res.error ? false : null;
}
