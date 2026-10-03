/**
 * Detects whether a request is speculative or prefetch from browser headers.
 */
export function isPrefetchRequest(headers: Headers): boolean {
  const secPurpose = headers.get("sec-purpose") || "";
  const purpose = headers.get("purpose") || "";
  const xMiddlewarePrefetch = headers.get("x-middleware-prefetch");
  const nextRouterPrefetch = headers.get("next-router-prefetch");

  return (
    secPurpose.toLowerCase().includes("prefetch") ||
    purpose.toLowerCase().includes("prefetch") ||
    xMiddlewarePrefetch !== null ||
    nextRouterPrefetch !== null
  );
}
