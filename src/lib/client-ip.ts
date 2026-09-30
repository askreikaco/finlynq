/**
 * Extract client IP address from request headers.
 * Checks x-real-ip first, then x-forwarded-for, with "unknown" as fallback.
 */

import type { NextRequest } from "next/server";

export type RequestLike = Request | NextRequest;

/**
 * Extract client IP from request headers.
 * Priority: x-real-ip (trimmed) > first entry of x-forwarded-for (trimmed) > "unknown"
 */
export function clientIp(req: RequestLike): string {
  // Check x-real-ip header first
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Check x-forwarded-for header (first entry only)
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstEntry = forwardedFor.split(",")[0];
    if (firstEntry) {
      return firstEntry.trim();
    }
  }

  return "unknown";
}
