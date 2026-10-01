/**
 * POST /api/family/manage/accept
 *
 * Accept a share invitation. The viewer (who must have the matching email)
 * accepts an invite, moving the share to "awaiting_owner_unlock" until the
 * owner's next sweep finalizes the grants.
 *
 * If must_share_back=true, creates a reciprocal share atomically (both succeed or both fail).
 *
 * Auth: Session-only (method==="account"); API key returns 403.
 * Rate limit: 10 accepts per user per 15 minutes.
 * Zod strict: no extra fields.
 *
 * On success: 200 with accepted share ID.
 * Errors: 400 (validation), 401 (auth), 403 (API key/2FA), 404 (token not found),
 *         409 (conflict), 410 (expired/consumed), 429 (rate limit), 500 (error).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { getUserById } from "@/lib/auth/queries";
import { consumeInvite, acceptShare, getShareById } from "@/lib/family/share-dal";
import { createUserKeypairIfNeeded, createSectionKey, sealAndStoreGrant } from "@/lib/family/grant";
import { syncFamilyLabels } from "@/lib/family/sweep";
import { hashInviteToken } from "@/lib/family/invite-token";
import { type FamilySection } from "@/lib/family/sections";
import {
  familyInvites,
  familyShares,
  userKeypairs,
} from "@/db/schema-pg";
import { sendEmail, familyShareAcceptedEmail } from "@/lib/email";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const AcceptRequestSchema = z
  .object({
    token: z.string().min(1),
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

  const { userId: viewerId } = auth.context;

  // Step 2: Get viewer's verified email
  const viewer = await getUserById(viewerId);
  if (!viewer || !viewer.emailVerified || !viewer.email) {
    return NextResponse.json(
      { error: "Email must be verified to accept shares" },
      { status: 403 }
    );
  }

  const viewerEmailLower = viewer.email.toLowerCase();

  // Step 3: Rate limit
  const rateLimit = checkRateLimit(
    `family-accept:${viewerId}`,
    10,
    15 * 60_000 // 10 per 15 minutes
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Accept rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  // Step 4: Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = AcceptRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { token } = parsed.data;

  // Step 5: Hash the token and find the invite
  const tokenHash = hashInviteToken(token);
  const [invite] = await db
    .select()
    .from(familyInvites)
    .where(eq(familyInvites.tokenHash, tokenHash));

  if (!invite) {
    // No enumeration: same response as if the token was consumed/expired
    return NextResponse.json(
      { error: "Invitation not found or already used" },
      { status: 410 }
    );
  }

  // Step 6: Verify invite is valid (not expired, not consumed, email matches)
  const now = new Date();
  if (invite.expiresAt < now) {
    return NextResponse.json(
      { error: "Invitation expired" },
      { status: 410 }
    );
  }

  if (invite.consumedAt) {
    return NextResponse.json(
      { error: "Invitation already used" },
      { status: 410 }
    );
  }

  if (invite.emailLower !== viewerEmailLower) {
    // Viewer email doesn't match invite email: no enumeration, return same as unknown invite
    return NextResponse.json(
      { error: "Invitation not found or already used" },
      { status: 410 }
    );
  }

  // Step 7: Get the share and verify state
  const share = await getShareById(db, invite.shareId, invite.shareId);
  if (!share) {
    return NextResponse.json(
      { error: "Share not found" },
      { status: 404 }
    );
  }

  if (share.status !== "pending") {
    return NextResponse.json(
      { error: "Share is no longer pending" },
      { status: 409 }
    );
  }

  // Step 8: Ensure viewer has DEK and keypair
  const viewerDek = auth.context.dek;
  if (!viewerDek) {
    return NextResponse.json(
      { error: "Session locked. Please sign in again." },
      { status: 423 }
    );
  }

  try {
    await createUserKeypairIfNeeded(db, viewerId, viewerDek);
  } catch (err) {
    console.error("[family] viewer keypair creation failed:", err);
    return NextResponse.json(
      { error: "Could not set up encryption" },
      { status: 500 }
    );
  }

  // Step 9: Atomic transaction: consume invite, accept share, create reciprocal if needed
  try {
    await db.transaction(async (tx) => {
      // Consume the invite (single-use)
      const consumed = await consumeInvite(tx, invite.id, viewerEmailLower);
      if (!consumed) {
        throw new Error("Invite already consumed or expired");
      }

      // Accept the share (move from pending to awaiting_owner_unlock)
      await acceptShare(tx, invite.shareId, viewerId, viewerEmailLower);

      // If must_share_back, create a reciprocal share
      if (share.mustShareBack) {
        const requiredBackSections = (share.requiredBackSections || share.sections) as string[];

        const [reciprocal] = await tx
          .insert(familyShares)
          .values({
            ownerId: viewerId,
            viewerEmailLower: share.ownerId, // Note: this is the viewer_email of the reciprocal
            viewerId: share.ownerId,
            sections: requiredBackSections,
            allSections: false,
            mustShareBack: false,
            requiredBackSections: [],
            reciprocalOf: invite.shareId,
            status: "active", // Viewer is online now, so we can create keys immediately
          })
          .returning({ id: familyShares.id });

        if (!reciprocal) {
          throw new Error("Failed to create reciprocal share");
        }

        // Create section keys for the reciprocal share (sealed to owner's pubkey)
        const [ownerKeypair] = await tx
          .select()
          .from(userKeypairs)
          .where(eq(userKeypairs.userId, share.ownerId));

        if (!ownerKeypair) {
          throw new Error("Owner has no keypair yet — cannot create reciprocal immediately");
        }

        // Create and seal section keys to the owner
        const ownerId = share.ownerId;
        for (const section of requiredBackSections as string[]) {
          const sectionKey = await createSectionKey(tx, viewerId, section, viewerDek, 1);
          try {
            await sealAndStoreGrant(
              tx,
              reciprocal.id,
              section,
              1,
              sectionKey,
              ownerKeypair.x25519Pub,
              viewerId,
              ownerId
            );
          } finally {
            sectionKey.fill(0);
          }
        }

        // Sweep labels for the reciprocal share (owner can immediately see reciprocal labels)
        const requiredSectionsList = (requiredBackSections as string[]).filter((s): s is FamilySection =>
          ["accounts", "net_worth", "investments", "goals", "budgets", "loans", "cashflow"].includes(s)
        );
        await syncFamilyLabels(tx, viewerId, viewerDek, { sections: requiredSectionsList });
      }
    });
  } catch (err) {
    console.error("[family] accept failed:", err);
    return NextResponse.json(
      { error: "Could not accept invitation" },
      { status: 500 }
    );
  }

  // Step 10: Notify the owner (if must_share_back; owner will see the reciprocal share)
  if (share.mustShareBack) {
    // Note: owner notification happens via must-share-back UI; no email here
  }

  // Step 11: Send confirmation email to viewer
  const owner = await getUserById(share.ownerId);
  if (owner) {
    const ownerName = owner.displayName || owner.email || "Someone";
    try {
      const msg = familyShareAcceptedEmail(ownerName);
      await sendEmail({
        ...msg,
        to: viewerEmailLower,
      });
    } catch (err) {
      console.error("[family] confirmation email send failed:", err);
      // Not fatal
    }
  }

  return NextResponse.json(
    { shareId: invite.shareId },
    { status: 200 }
  );
}
