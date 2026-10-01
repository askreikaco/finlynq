/**
 * POST /api/family/manage/invite
 *
 * Invite a viewer by email. ALWAYS creates (or refreshes) a pending share + single-use 7-day
 * invite and emails the address, whether or not the address belongs to a registered user, and
 * returns the same 201 body either way (no account-existence oracle).
 *
 * Auth: session-only. Limits: 10/day/user, 3/day/email (identical 429 body for both).
 * Body (strict): { viewerEmail, sections[], mustShareBack? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserById } from "@/lib/auth/queries";
import { createShare } from "@/lib/family/share-dal";
import { createUserKeypairIfNeeded } from "@/lib/family/grant";
import { generateInviteToken, hashInviteToken, getInviteExpiresAt } from "@/lib/family/invite-token";
import { FamilySectionSchema } from "@/lib/family/sections";
import { familyInvites, familyShares } from "@/db/schema-pg";
import { sendEmail, familyInviteEmail } from "@/lib/email";
import { rateLimited, readStrictBody, requireFamilySession } from "@/lib/family/manage-guard";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60_000;
const RATE_MSG = "Invitation limit reached. Try again tomorrow.";

const InviteRequestSchema = z
  .object({
    viewerEmail: z.string().trim().max(254).email().toLowerCase(),
    sections: z.array(FamilySectionSchema).min(1),
    mustShareBack: z.boolean().optional().default(false),
  })
  .strict();

export async function POST(request: NextRequest) {
  const guard = await requireFamilySession(request);
  if (!guard.ok) return guard.response;
  const { userId: ownerId, dek: ownerDek } = guard.ctx;

  const userRl = checkRateLimit(`family-invite-user:${ownerId}`, 10, DAY_MS);
  if (!userRl.allowed) return rateLimited(userRl.resetAt, RATE_MSG);

  const body = await readStrictBody(request, InviteRequestSchema);
  if (!body.ok) return body.response;
  const { viewerEmail, sections, mustShareBack } = body.data;

  // Same body as the per-user limit: does not reveal that OTHER owners invited this address.
  const emailRl = checkRateLimit(`family-invite-email:${viewerEmail}`, 3, DAY_MS);
  if (!emailRl.allowed) return rateLimited(emailRl.resetAt, RATE_MSG);

  if (!ownerDek) {
    return NextResponse.json({ error: "Session locked. Please sign in again." }, { status: 423 });
  }

  const owner = await getUserById(ownerId);
  if (!owner) return NextResponse.json({ error: "Internal error" }, { status: 500 });

  // Keyed on the address only (never on whether an account exists for it).
  const [existingLive] = await db
    .select({ id: familyShares.id })
    .from(familyShares)
    .where(
      and(
        eq(familyShares.ownerId, ownerId),
        eq(familyShares.viewerEmailLower, viewerEmail),
        inArray(familyShares.status, ["active", "awaiting_owner_unlock"]),
      ),
    )
    .limit(1);
  if (existingLive || owner.email?.toLowerCase() === viewerEmail) {
    return NextResponse.json({ error: "Cannot create this invitation" }, { status: 409 });
  }

  try {
    await createUserKeypairIfNeeded(db, ownerId, ownerDek);
  } catch {
    console.error("[family] invite: keypair setup failed");
    return NextResponse.json({ error: "Could not set up encryption" }, { status: 500 });
  }

  const token = generateInviteToken();
  let shareId: string;
  try {
    shareId = await db.transaction(async (tx) => {
      // One pending share per (owner, address): re-inviting refreshes it and rotates the token.
      const [pending] = await tx
        .select({ id: familyShares.id })
        .from(familyShares)
        .where(
          and(
            eq(familyShares.ownerId, ownerId),
            eq(familyShares.viewerEmailLower, viewerEmail),
            eq(familyShares.status, "pending"),
          ),
        )
        .limit(1);

      let id: string;
      if (pending) {
        id = pending.id;
        const deduped = Array.from(new Set(sections));
        await tx
          .update(familyShares)
          .set({ sections: deduped, mustShareBack, requiredBackSections: mustShareBack ? deduped : [] })
          .where(eq(familyShares.id, id));
        await tx.delete(familyInvites).where(and(eq(familyInvites.shareId, id), isNull(familyInvites.consumedAt)));
      } else {
        id = await createShare(tx, ownerId, viewerEmail, sections, mustShareBack);
      }
      await tx.insert(familyInvites).values({
        shareId: id,
        emailLower: viewerEmail,
        tokenHash: hashInviteToken(token),
        expiresAt: getInviteExpiresAt(),
      });
      return id;
    });
  } catch {
    console.error("[family] invite: could not create share/invite");
    return NextResponse.json({ error: "Could not create invitation" }, { status: 500 });
  }

  // Email failure is non-fatal and logs no token / address (resend is available).
  try {
    const acceptUrl = `${process.env.APP_URL || "http://localhost:3000"}/family/accept?token=${encodeURIComponent(token)}`;
    await sendEmail({
      ...familyInviteEmail(owner.displayName || owner.email || "Someone", acceptUrl),
      to: viewerEmail,
    });
  } catch (err) {
    console.error("[family] invite email failed:", err instanceof Error ? err.name : "error");
  }

  return NextResponse.json({ shareId }, { status: 201 });
}
