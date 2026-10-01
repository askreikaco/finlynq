/**
 * POST /api/family/manage/decline
 *
 * Decline an invitation by its token (the invitee has no share id and no viewer_id yet).
 * Same rules as accept: session-only, verified email must equal the invite email, token must be
 * unconsumed; every failure returns the same 410 body. Effect: invite consumed, share -> declined.
 *
 * Body (strict): { token }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserById } from "@/lib/auth/queries";
import { familyInvites, familyShares } from "@/db/schema-pg";
import { hashInviteToken, tokenHashesEqual } from "@/lib/family/invite-token";
import { inviteGone, rateLimited, readStrictBody, requireFamilySession } from "@/lib/family/manage-guard";

export const dynamic = "force-dynamic";

const DeclineRequestSchema = z.object({ token: z.string().min(1).max(256) }).strict();

export async function POST(request: NextRequest) {
  const guard = await requireFamilySession(request);
  if (!guard.ok) return guard.response;
  const { userId: viewerId } = guard.ctx;

  const rl = checkRateLimit(`family-accept:${viewerId}`, 10, 15 * 60_000);
  if (!rl.allowed) return rateLimited(rl.resetAt, "Too many attempts. Try again later.");

  const body = await readStrictBody(request, DeclineRequestSchema);
  if (!body.ok) return body.response;

  const viewer = await getUserById(viewerId);
  if (!viewer || !viewer.emailVerified || !viewer.email) {
    return NextResponse.json({ error: "Email must be verified" }, { status: 403 });
  }
  const viewerEmailLower = viewer.email.toLowerCase();

  const tokenHash = hashInviteToken(body.data.token);
  const [invite] = await db.select().from(familyInvites).where(eq(familyInvites.tokenHash, tokenHash)).limit(1);
  if (!invite || !tokenHashesEqual(invite.tokenHash, tokenHash)) return inviteGone();
  if (invite.emailLower !== viewerEmailLower || invite.consumedAt) return inviteGone();

  try {
    const ok = await db.transaction(async (tx) => {
      const [declined] = await tx
        .update(familyShares)
        .set({ status: "declined" })
        .where(
          and(
            eq(familyShares.id, invite.shareId),
            eq(familyShares.status, "pending"),
            eq(familyShares.viewerEmailLower, viewerEmailLower),
          ),
        )
        .returning({ id: familyShares.id });
      if (!declined) return false;
      await tx.update(familyInvites).set({ consumedAt: new Date() }).where(eq(familyInvites.id, invite.id));
      return true;
    });
    if (!ok) return inviteGone();
  } catch {
    console.error("[family] decline failed");
    return NextResponse.json({ error: "Could not decline invitation" }, { status: 500 });
  }

  return NextResponse.json({ status: "declined" }, { status: 200 });
}
