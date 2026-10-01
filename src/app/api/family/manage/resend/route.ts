/**
 * POST /api/family/manage/resend
 *
 * Re-send the invite for a pending share. The previous token is invalidated (a fresh single-use
 * token with a fresh 7-day expiry replaces it; tokens are stored only as hashes).
 *
 * Auth: session-only, owner only. Limits: shares the invite limits (10/day/user, 3/day/email).
 * Body (strict): { shareId }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserById } from "@/lib/auth/queries";
import { familyInvites, familyShares } from "@/db/schema-pg";
import { generateInviteToken, hashInviteToken, getInviteExpiresAt } from "@/lib/family/invite-token";
import { sendEmail, familyInviteEmail } from "@/lib/email";
import { manageLimit, rateLimited, readStrictBody, requireFamilySession } from "@/lib/family/manage-guard";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60_000;
const RATE_MSG = "Invitation limit reached. Try again tomorrow.";

const ResendRequestSchema = z.object({ shareId: z.string().uuid() }).strict();

export async function POST(request: NextRequest) {
  const guard = await requireFamilySession(request);
  if (!guard.ok) return guard.response;
  const { userId: ownerId } = guard.ctx;

  const limited = manageLimit(ownerId);
  if (limited) return limited;

  const body = await readStrictBody(request, ResendRequestSchema);
  if (!body.ok) return body.response;
  const { shareId } = body.data;

  // Owner-only: a share the caller does not own is indistinguishable from a missing one.
  const [share] = await db
    .select()
    .from(familyShares)
    .where(and(eq(familyShares.id, shareId), eq(familyShares.ownerId, ownerId), eq(familyShares.status, "pending")))
    .limit(1);
  if (!share) {
    return NextResponse.json({ error: "Share not found or is not pending" }, { status: 404 });
  }

  const userRl = checkRateLimit(`family-invite-user:${ownerId}`, 10, DAY_MS);
  if (!userRl.allowed) return rateLimited(userRl.resetAt, RATE_MSG);
  const emailRl = checkRateLimit(`family-invite-email:${share.viewerEmailLower}`, 3, DAY_MS);
  if (!emailRl.allowed) return rateLimited(emailRl.resetAt, RATE_MSG);

  const owner = await getUserById(ownerId);
  if (!owner) return NextResponse.json({ error: "Internal error" }, { status: 500 });

  const token = generateInviteToken();
  try {
    const updated = await db
      .update(familyInvites)
      .set({
        tokenHash: hashInviteToken(token),
        expiresAt: getInviteExpiresAt(),
        sendCount: sql`${familyInvites.sendCount} + 1`,
        lastSentAt: new Date(),
      })
      .where(and(eq(familyInvites.shareId, shareId), isNull(familyInvites.consumedAt)))
      .returning({ id: familyInvites.id });
    if (updated.length === 0) {
      return NextResponse.json({ error: "No active invitation found for this share" }, { status: 404 });
    }
  } catch {
    console.error("[family] resend: could not refresh invite");
    return NextResponse.json({ error: "Could not refresh invitation" }, { status: 500 });
  }

  try {
    const acceptUrl = `${process.env.APP_URL || "http://localhost:3000"}/family/accept?token=${encodeURIComponent(token)}`;
    await sendEmail({
      ...familyInviteEmail(owner.displayName || owner.email || "Someone", acceptUrl),
      to: share.viewerEmailLower,
    });
  } catch (err) {
    console.error("[family] resend email failed:", err instanceof Error ? err.name : "error");
  }

  return NextResponse.json({ status: "resent" }, { status: 200 });
}
