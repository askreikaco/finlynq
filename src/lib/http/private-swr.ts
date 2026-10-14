/**
 * Browser-HTTP-cache headers for read-only metric/series GETs (metric-card cache).
 *
 * `private` (never a shared/CDN cache), `Vary: Cookie` (a different session never reuses the entry, so account
 * switch / another user on the same browser cannot see it), short max-age + stale-while-revalidate so a repeat visit
 * is served from memory/disk while the browser refreshes in the background. Writes bypass it client-side
 * (src/lib/swr/http-freshness.ts). Apply to 2xx numeric responses only; errors stay uncached.
 */
import type { NextResponse } from "next/server";

export const METRIC_MAX_AGE_S = 10;
export const METRIC_SWR_S = 50;

export function withPrivateSwr<T extends NextResponse>(res: T, maxAge = METRIC_MAX_AGE_S, swr = METRIC_SWR_S): T {
  if (res.status < 200 || res.status >= 300) return res;
  res.headers.set("Cache-Control", `private, max-age=${maxAge}, stale-while-revalidate=${swr}`);
  res.headers.append("Vary", "Cookie");
  return res;
}
