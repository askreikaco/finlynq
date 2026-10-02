/**
 * GET /api/family/overview  - the ONLY viewer data endpoint of Family Wealth.
 *
 * Order: session-only auth (account method; api_key/oauth/pending -> 403) -> rate limit
 * 30/min/viewer -> 2FA gate (403 mfa_required) -> strict query (unknown params -> 400) ->
 * active shares where the caller is the viewer -> assembleFamilyOverview -> allow-list serializer.
 *
 * GET only: every other method is answered 405 by src/middleware.ts (and Next for methods not
 * exported). Nothing here writes except the throttled last_viewed_at audit stamp on the viewer's
 * own shares. HTTP responses are never cached (no-store); the server keeps a per-viewer, per-day
 * in-memory copy (overview/cache.ts) that ?refresh=1 bypasses.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { familyShares } from "@/db/schema-pg";
import { getDisplayCurrency } from "@/lib/fx-service";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimited, requireFamilySession } from "@/lib/family/manage-guard";
import { updateLastViewed } from "@/lib/family/share-dal";
import { assembleFamilyOverview } from "@/lib/family/overview/assemble";
import { OVERVIEW_PERIODS, serializeOverview } from "@/lib/family/overview/dto";
import { FxContext } from "@/lib/family/overview/fx";
import { viewerPassesMfaGate } from "@/lib/family/overview/gate";
import { getCachedOverview, overviewCacheEnabled, overviewCacheKey, setCachedOverview } from "@/lib/family/overview/cache";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const LAST_VIEWED_THROTTLE_MS = 5 * 60_000;

// `currency` is accepted for client compatibility but ignored: the viewer's display currency
// always comes from the viewer's own settings (plan 6).
const QuerySchema = z
  .object({
    currency: z.string().max(8).optional(),
    // month = month-to-date (default), year = year-to-date, all; legacy 6m / 1y still accepted
    period: z.enum(OVERVIEW_PERIODS).optional().default("month"),
    // Refresh button: rebuild instead of serving today's cached copy
    refresh: z.enum(["1"]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const guard = await requireFamilySession(request);
  if (!guard.ok) return guard.response;
  const { userId: viewerId, dek, mfaVerified } = guard.ctx;

  const rl = checkRateLimit(`family-overview:${viewerId}`, 30, 60_000);
  if (!rl.allowed) return rateLimited(rl.resetAt);

  if (!(await viewerPassesMfaGate(viewerId, mfaVerified))) {
    return NextResponse.json(
      { error: "mfa_required", message: "Two-factor authentication is required to view Family Wealth." },
      { status: 403, headers: NO_STORE },
    );
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400, headers: NO_STORE },
    );
  }
  const { period, refresh } = parsed.data;

  const today = new Date().toISOString().slice(0, 10);
  const display = await getDisplayCurrency(viewerId);
  const fx = new FxContext(viewerId, display, today);

  const shares = await db
    .select({
      id: familyShares.id,
      ownerId: familyShares.ownerId,
      allSections: familyShares.allSections,
      sections: familyShares.sections,
      mustShareBack: familyShares.mustShareBack,
      requiredBackSections: familyShares.requiredBackSections,
      lastViewedAt: familyShares.lastViewedAt,
      createdAt: familyShares.createdAt,
    })
    .from(familyShares)
    .where(and(eq(familyShares.viewerId, viewerId), eq(familyShares.status, "active")));
  shares.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const cacheKey = overviewCacheKey({ viewerId, period, display: fx.display, unlocked: !!dek, shares });
  let cached = refresh || !overviewCacheEnabled() ? null : getCachedOverview(cacheKey, today);
  if (!cached) {
    const { members, partial } = await assembleFamilyOverview({
      viewerId,
      viewerDek: dek,
      shares,
      fx,
      period,
      today,
    });
    const body = serializeOverview({ displayCurrency: fx.display, period, asOf: today, partial, members });
    cached = setCachedOverview(cacheKey, today, body);
  }

  // Audit stamp for the owner ("last viewed"), throttled; failure never affects the response.
  const cutoff = Date.now() - LAST_VIEWED_THROTTLE_MS;
  for (const s of shares) {
    if (!s.lastViewedAt || s.lastViewedAt.getTime() < cutoff) {
      await updateLastViewed(db, s.id, viewerId).catch(() => undefined);
    }
  }

  return NextResponse.json(cached.body, { headers: { ...NO_STORE, "X-Generated-At": cached.generatedAt } });
}
