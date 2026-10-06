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
 * Price-driven routes (dashboard, portfolio, accounts, goals, reports) use hourly buckets;
 * others use daily (via UTC date component in generateETag).
 */
export function getTimeComponentForRoute(route: string): string {
  const priceDrivenRoutes = [
    "/api/v1/accounts",
    "/api/v1/dashboard",
    "/api/v1/portfolio/overview",
    "/api/v1/reports",
    "/api/v1/goals",
  ];
  return priceDrivenRoutes.some((pr) => route.startsWith(pr)) ? getUtcHour() : "";
}

/**
 * Generate an ETag from route, query params, data version, DEK state, and optional extra info.
 * Always includes UTC date (for daily refresh on price/FX changes).
 * The extra parameter can include UTC hour for hourly refresh on price-driven routes.
 *
 * @param route - request path (e.g., "/api/accounts")
 * @param queryString - request search params (e.g., "?includeArchived=1")
 * @param dataVersion - user's current data_version
 * @param dekState - DEK locked state
 * @param extra - optional extra string (e.g., UTC hour "2025-01-15T14" for hourly refresh)
 */
export function generateETag(
  route: string,
  queryString: string,
  dataVersion: number,
  dekState: boolean,
  extra?: string
): string {
  // Always include UTC date (daily refresh for price/FX changes)
  const utcDate = getUtcDate();
  // Append extra (e.g., hourly bucket) if provided for price-driven routes
  const combined = extra ? `${utcDate}|${extra}` : utcDate;
  const payload = `${route}|${queryString}|${dataVersion}|${dekState ? "locked" : "unlocked"}|${combined}`;
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

  const etag = generateETag(route, queryString, dataVersion, !!dek, timeComponent || undefined);

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
