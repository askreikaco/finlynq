/**
 * POST /api/family/manage/accept
 *
 * Accept an invitation. Requirements (all enforced server-side):
 *  - session auth (api_key / oauth rejected), unlocked session (DEK present)
 *  - the logged-in user's VERIFIED email equals the invite's email
 *  - token matches an invite that is unconsumed and unexpired (single-use)
 * Unknown token, foreign-email session and self-accept all return the SAME 410 body.
 *
 * Step-up: required when must_share_back is true (creating a reciprocal share).
 *
 * Effect (ONE transaction): consume invite, pending -> awaiting_owner_unlock (the owner's next
 * sweep finalizes grants). If must_share_back: create the reciprocal share (viewer -> owner,
 * sections = required U extra), mint viewer's section keys and seal them to the owner. Any
 * failure rolls everything back: no partial share, grants or keys.
 *
 * Body (strict): { token, shareBackSections?, currentPassword? }  (shareBackSections only used with must_share_back)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserById } from "@/lib/auth/queries";
import { consumeInvite, acceptShare } from "@/lib/family/share-dal";
import { ensureUserKeypair } from "@/lib/family/manage-ops";
import { syncFamilyLabels } from "@/lib/family/sweep";
import { hashInviteToken, tokenHashesEqual } from "@/lib/family/invite-token";
import { FamilySectionSchema, type FamilySection } from "@/lib/family/sections";
import { familyInvites, familyShares, users } from "@/db/schema-pg";
import { sendEmail, familyShareAcceptedEmail } from "@/lib/email";
import {
  inviteGone,
  isCheckViolation,
  isUniqueViolation,
  rateLimited,
  readStrictBody,
  requireFamilySession,
  requireFamilyStepUp,
} from "@/lib/family/manage-guard";

export const dynamic = "force-dynamic";

const AcceptRequestSchema = z
  .object({
    token: z.string().min(1).max(256),
    shareBackSections: z.array(FamilySectionSchema).optional(),
    currentPassword: z.string().optional(),
  })
  .strict();

class AcceptRaceError extends Error {}

export async function POST(request: NextRequest) {
  const guard = await requireFamilySession(request);
  if (!guard.ok) return guard.response;
  const { userId: viewerId, dek: viewerDek } = guard.ctx;

  // Limit first: caps token-guessing regardless of any later outcome.
  const rl = checkRateLimit(`family-accept:${viewerId}`, 10, 15 * 60_000);
  if (!rl.allowed) return rateLimited(rl.resetAt, "Too many attempts. Try again later.");

  const body = await readStrictBody(request, AcceptRequestSchema);
  if (!body.ok) return body.response;
  const { token, shareBackSections, currentPassword } = body.data;

  const viewer = await getUserById(viewerId);
  if (!viewer || !viewer.emailVerified || !viewer.email) {
    return NextResponse.json({ error: "Email must be verified to accept shares" }, { status: 403 });
  }
  const viewerEmailLower = viewer.email.toLowerCase();

  // Lookup by hash, then constant-time confirm. Email is checked BEFORE expiry/consumed so a
  // foreign session learns nothing about a token's state.
  const tokenHash = hashInviteToken(token);
  const [invite] = await db.select().from(familyInvites).where(eq(familyInvites.tokenHash, tokenHash)).limit(1);
  if (!invite || !tokenHashesEqual(invite.tokenHash, tokenHash)) return inviteGone();
  if (invite.emailLower !== viewerEmailLower) return inviteGone();
  if (invite.consumedAt) return inviteGone();
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  }

  const [share] = await db.select().from(familyShares).where(eq(familyShares.id, invite.shareId)).limit(1);
  if (!share || share.ownerId === viewerId || share.viewerEmailLower !== viewerEmailLower) return inviteGone();
  if (share.status !== "pending") return inviteGone();

  // Step-up (accept with share-back only): fresh session OR correct currentPassword.
  if (share.mustShareBack) {
    const stepUp = await requireFamilyStepUp(guard.ctx, currentPassword);
    if (stepUp) return stepUp;
  }

  if (!viewerDek) {
    return NextResponse.json({ error: "Session locked. Please sign in again." }, { status: 423 });
  }

  try {
    await ensureUserKeypair(viewerId, viewerDek);
  } catch {
    console.error("[family] accept: keypair setup failed");
    return NextResponse.json({ error: "Could not set up encryption" }, { status: 500 });
  }

  try {
    await db.transaction(async (tx) => {
      if (!(await consumeInvite(tx, invite.id, viewerEmailLower))) {
        throw new AcceptRaceError(); // consumed/expired concurrently
      }
      await acceptShare(tx, invite.shareId, viewerId, viewerEmailLower);

      if (share.mustShareBack) {
        const required = (share.requiredBackSections?.length ? share.requiredBackSections : share.sections) as string[];
        const backSections = Array.from(new Set([...required, ...(shareBackSections ?? [])])) as FamilySection[];
        const [ownerUser] = await tx
          .select()
          .from(users)
          .where(eq(users.id, share.ownerId))
          .limit(1);
        if (!ownerUser?.email) throw new Error("owner missing");

        // SQL trigger family_shares_min_scope_guard re-checks sections ⊇ required.
        await tx.insert(familyShares).values({
          ownerId: viewerId,
          viewerId: share.ownerId,
          viewerEmailLower: ownerUser.email.toLowerCase(),
          sections: backSections,
          allSections: false,
          mustShareBack: false,
          requiredBackSections: [],
          reciprocalOf: share.id,
          status: "active", // viewer is online (DEK present): keys are sealed right now
        });

        // Mints B's section keys and seals them to the owner's public key (owner keypair was
        // created at invite time); also promotes/provisions B's other live shares.
        await syncFamilyLabels(tx, viewerId, viewerDek, { sections: backSections });
      }
    });
  } catch (err) {
    if (err instanceof AcceptRaceError) return inviteGone();
    if (isUniqueViolation(err) || isCheckViolation(err)) {
      return NextResponse.json({ error: "Share conflicts with an existing share" }, { status: 409 });
    }
    console.error("[family] accept failed:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "Could not accept invitation" }, { status: 500 });
  }

  // Notify the OWNER (display name only). Non-fatal.
  try {
    const owner = await getUserById(share.ownerId);
    if (owner?.email) {
      await sendEmail({
        ...familyShareAcceptedEmail(viewer.displayName || "Your invitee"),
        to: owner.email,
      });
    }
  } catch (err) {
    console.error("[family] accept notification failed:", err instanceof Error ? err.name : "error");
  }

  return NextResponse.json({ shareId: invite.shareId }, { status: 200 });
}
