import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import type { AuthContext } from "@/lib/auth/strategy";

export async function incrementDataVersion(userId: string) {
  await db
    .update(schema.users)
    .set({ dataVersion: sql`${schema.users.dataVersion} + 1` })
    .where(eq(schema.users.id, userId));
}

export async function getDataVersion(userId: string): Promise<number> {
  const row = await db
    .select({ dataVersion: schema.users.dataVersion })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return row?.dataVersion ?? 1;
}

/**
 * Get the current UTC date for ETag generation (YYYY-MM-DD).
 * Used to invalidate ETags daily due to external price/FX changes.
 */
function getUtcDate(): string {
  return new Date().toISOString().split("T")[0]; // "2025-01-15"
}

/**
 * Get the current UTC hour for ETag generation (YYYY-MM-DDTHH).
 * Used for price-driven routes to refresh hourly.
 */
function getUtcHour(): string {
  return new Date().toISOString().slice(0, 13); // "2025-01-15T14"
}

/**
 * Helper to get the appropriate time bucket for a route.
 * Price-driven routes (dashboard, portfolio, accounts, goals, reports) use hourly buckets
 * because they display live market prices and FX rates that change throughout the day.
 * Data-only routes (transactions, rules, categories) use daily refresh (via UTC date in generateETag).
 *
 * Real routes (verified via grep of src/app/api):
 * - /api/accounts (price-driven: account balances depend on live security prices)
 * - /api/dashboard (price-driven: portfolio value, asset allocation, returns)
 * - /api/portfolio/overview (price-driven: holdings, performance)
 * - /api/goals (price-driven: goal progress depends on live portfolio values)
 * - /api/reports (price-driven: some reports show unrealized gains, FX impact)
 * - /api/rules, /api/transactions, /api/categories (data-only: no live pricing)
 */
export function getTimeComponentForRoute(route: string): string {
  const priceDrivenRoutes = [
    "/api/accounts",
    "/api/dashboard",
    "/api/portfolio/overview",
    "/api/goals",
    "/api/reports",
  ];
  return priceDrivenRoutes.some((pr) => route.startsWith(pr)) ? getUtcHour() : "";
}

/**
 * Generate an ETag from route, query params, data version, userId, DEK state, and optional extra info.
 * Always includes UTC date (for daily refresh on price/FX changes).
 * The extra parameter can include UTC hour for hourly refresh on price-driven routes.
 *
 * @param route - request path (e.g., "/api/accounts")
 * @param queryString - request search params (e.g., "?includeArchived=1")
 * @param dataVersion - user's current data_version
 * @param userId - user ID (included in hash for per-user ETags)
 * @param dekState - DEK unlocked state (true = DEK present/unlocked, false = DEK missing/locked)
 * @param extra - optional extra string (e.g., UTC hour "2025-01-15T14" for hourly refresh)
 */
export function generateETag(
  route: string,
  queryString: string,
  dataVersion: number,
  userId: string,
  dekState: boolean,
  extra?: string
): string {
  // Always include UTC date (daily refresh for price/FX changes)
  const utcDate = getUtcDate();
  // Append extra (e.g., hourly bucket) if provided for price-driven routes
  const combined = extra ? `${utcDate}|${extra}` : utcDate;
  // Fixed label: dekState true = unlocked (DEK present), false = locked (DEK missing)
  const payload = `${route}|${queryString}|${dataVersion}|${userId}|${dekState ? "unlocked" : "locked"}|${combined}`;
  return `"${createHash("sha256").update(payload).digest("hex")}"`;
}

/**
 * Check ETag and handle 304 Not Modified responses.
 * Automatically determines time component based on route (hourly for price-driven routes, daily otherwise).
 *
 * @param request - incoming HTTP request
 * @param extra - optional extra string to override auto-detection (for testing)
 * @returns object with optional response (if 304), etag, and authContext
 */
export async function checkETag(
  request: NextRequest,
  extra?: string
): Promise<{ response?: NextResponse; etag?: string; authContext?: AuthContext }> {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return { response: auth.response };

  const { userId, dek } = auth.context;
  const dataVersion = await getDataVersion(userId);
  const url = new URL(request.url);
  const route = url.pathname;
  const queryString = url.search;

  // Auto-detect time component if not provided (for price-driven routes)
  const timeComponent = extra ?? getTimeComponentForRoute(route);

  const etag = generateETag(route, queryString, dataVersion, userId, !!dek, timeComponent || undefined);

  if (request.headers.get("if-none-match") === etag) {
    return {
      response: new NextResponse(null, {
        status: 304,
        headers: {
          "ETag": etag,
          "Cache-Control": "private, no-cache",
        },
      }),
    };
  }

  return { etag, authContext: auth.context };
}

/**
 * Helper to add ETag and Cache-Control headers to a response.
 * Used by route handlers to set proper HTTP caching headers on 200 responses.
 *
 * @param response - the response to add headers to
 * @param etag - the ETag value to set
 * @returns the response with headers set
 */
export function withEtagHeaders(response: NextResponse, etag: string): NextResponse {
  response.headers.set("ETag", etag);
  response.headers.set("Cache-Control", "private, no-cache");
  return response;
}
