/**
 * POST /api/family/manage/resend
 *
 * Resend an invite email (same token). Only for pending shares.
 *
 * Auth: Session-only (method==="account"); API key returns 403.
 * Rate limit: 10 per user per day, 3 per email per day.
 * Zod strict: no extra fields.
 *
 * On success: 200.
 * Errors: 400 (validation), 401 (auth), 403 (API key), 404 (not found), 409 (conflict), 429 (rate limit), 500 (error).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { getUserById } from "@/lib/auth/queries";
import { getShareById } from "@/lib/family/share-dal";
import { familyInvites } from "@/db/schema-pg";
import { sendEmail, familyInviteEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const ResendRequestSchema = z
  .object({
    shareId: z.string().uuid(),
  })
  .strict();

export async function POST(request: NextRequest) {
  // Step 1: Authenticate — session-only
  const auth = await requireAuth(request);
  if (!auth.authenticated) {
    return auth.response;
  }

  if (auth.context.method !== "account") {
    return NextResponse.json(
      { error: "Only session authentication is allowed" },
      { status: 403 }
    );
  }

  const { userId: ownerId } = auth.context;

  // Step 2: Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = ResendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { shareId } = parsed.data;

  // Step 3: Get the share (must be owned by this user and pending)
  const share = await getShareById(db, shareId, ownerId);
  if (!share || share.status !== "pending") {
    return NextResponse.json(
      { error: "Share not found or is not pending" },
      { status: 404 }
    );
  }

  if (share.ownerId !== ownerId) {
    return NextResponse.json(
      { error: "Only the owner can resend invitations" },
      { status: 403 }
    );
  }

  const viewerEmail = share.viewerEmailLower;

  // Step 4: Rate limits (same as invite)
  const rateLimitUser = checkRateLimit(
    `family-invite-user:${ownerId}`,
    10,
    24 * 60 * 60_000
  );
  if (!rateLimitUser.allowed) {
    return NextResponse.json(
      { error: "Invite rate limit exceeded. Try again tomorrow." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimitUser.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const rateLimitEmail = checkRateLimit(
    `family-invite-email:${viewerEmail}`,
    3,
    24 * 60 * 60_000
  );
  if (!rateLimitEmail.allowed) {
    return NextResponse.json(
      { error: "This email has received too many invitations. Try again tomorrow." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimitEmail.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  // Step 5: Get the invite record (must be unconsumed)
  const [invite] = await db
    .select()
    .from(familyInvites)
    .where(and(eq(familyInvites.shareId, shareId), isNull(familyInvites.consumedAt)));

  if (!invite) {
    return NextResponse.json(
      { error: "No active invitation found for this share" },
      { status: 404 }
    );
  }

  // Step 6: Update send count and last_sent_at
  try {
    await db
      .update(familyInvites)
      .set({
        sendCount: (invite.sendCount || 1) + 1,
        lastSentAt: new Date(),
      })
      .where(eq(familyInvites.id, invite.id));
  } catch (err) {
    console.error("[family] resend update failed:", err);
    return NextResponse.json(
      { error: "Could not update invitation" },
      { status: 500 }
    );
  }

  // Step 7: Send email (token is in the database; we reconstruct the link)
  const owner = await getUserById(ownerId);
  if (!owner) {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }

  const inviterName = owner.displayName || owner.email || "Someone";

  // Since tokenHash is stored (not the raw token), regenerate a new token for resend
  const { generateInviteToken, hashInviteToken, getInviteExpiresAt } = await import("@/lib/family/invite-token");
  const newToken = generateInviteToken();
  const newTokenHash = hashInviteToken(newToken);
  const newExpiresAt = getInviteExpiresAt();

  try {
    await db
      .update(familyInvites)
      .set({
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      })
      .where(eq(familyInvites.id, invite.id));
  } catch (err) {
    console.error("[family] resend token update failed:", err);
    return NextResponse.json(
      { error: "Could not regenerate invitation token" },
      { status: 500 }
    );
  }

  const newAcceptUrl = `${process.env.APP_URL || "http://localhost:3000"}/family/accept?token=${encodeURIComponent(newToken)}`;
  const emailMsg = familyInviteEmail(inviterName, newAcceptUrl);

  try {
    await sendEmail({
      ...emailMsg,
      to: viewerEmail,
    });
  } catch (err) {
    console.error("[family] resend email failed:", err);
    // Not fatal
  }

  return NextResponse.json({ status: "resent" }, { status: 200 });
}
