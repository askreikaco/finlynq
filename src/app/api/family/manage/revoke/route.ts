/**
 * POST /api/family/manage/revoke
 *
 * Revoke a share (by owner or viewer). Performs:
 * 1. Status -> "revoked"
 * 2. Deletes key grants (revoked viewer can't unseal)
 * 3. Rotates epoch for each section the revoked viewer had (re-encrypts sidecar)
 * 4. If owner-initiated: notifies viewer
 *
 * Auth: Session-only (method==="account"); API key returns 403.
 * Zod strict: no extra fields.
 *
 * On success: 200.
 * Errors: 400 (validation), 401 (auth), 403 (API key), 404 (not found), 409 (conflict), 500 (error).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { getUserById } from "@/lib/auth/queries";
import { getShareById, revokeShare } from "@/lib/family/share-dal";
import { rotateEpoch } from "@/lib/family/grant";
import { sendEmail, familyShareRevokedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const RevokeRequestSchema = z
  .object({
    shareId: z.string().uuid(),
  })
  .strict();

// Import share-dal helper (keyedSectionsOfShare is not exported; we'll recreate it)
function getKeyedSections(share: { allSections: boolean; sections: string[] }): string[] {
  if (share.allSections) {
    return [
      "net_worth",
      "accounts",
      "investments",
      "goals",
      "budgets",
      "loans",
      "cashflow",
    ];
  }
  return share.sections;
}

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

  const { userId: actorId } = auth.context;

  // Step 2: Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = RevokeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { shareId } = parsed.data;

  // Step 3: Get the share
  const share = await getShareById(db, shareId, actorId);
  if (!share) {
    return NextResponse.json(
      { error: "Share not found" },
      { status: 404 }
    );
  }

  // Step 4: Check that the share is revocable
  const isOwner = share.ownerId === actorId;
  if (!isOwner && share.viewerId !== actorId) {
    return NextResponse.json(
      { error: "Cannot revoke this share" },
      { status: 403 }
    );
  }

  // Step 5: Revoke the share (deletes key grants)
  try {
    await revokeShare(db, shareId, actorId);
  } catch (err) {
    console.error("[family] revoke failed:", err);
    return NextResponse.json(
      { error: "Could not revoke share" },
      { status: 500 }
    );
  }

  // Step 6: If owner-initiated, rotate epochs for each section the viewer had
  // (viewer-initiated revoke defers rotation to next owner sweep)
  if (isOwner) {
    const ownerDek = auth.context.dek;
    if (ownerDek && share.ownerId) {
      const sections = getKeyedSections(share);
      try {
        for (const section of sections) {
          await rotateEpoch(db, share.ownerId, section, ownerDek);
        }
      } catch (err) {
        console.error("[family] epoch rotation failed:", err);
        // Rotation failure doesn't fail the revoke, but log it prominently
      }
    }
  }

  // Step 7: Send notification email
  if (isOwner && share.viewerId) {
    // Owner revoked: notify the viewer
    const viewer = await getUserById(share.viewerId);
    if (viewer && viewer.email && share.ownerId) {
      const ownerUser = await getUserById(share.ownerId);
      const ownerName = ownerUser?.displayName || ownerUser?.email || "Someone";
      try {
        const msg = familyShareRevokedEmail(ownerName);
        await sendEmail({
          ...msg,
          to: viewer.email,
        });
      } catch (err) {
        console.error("[family] revocation email send failed:", err);
        // Not fatal
      }
    }
  } else if (!isOwner && share.ownerId) {
    // Viewer revoked: notify the owner (they can re-invite)
    // For now, no email notification; owner sees status change in the UI
  }

  return NextResponse.json({ status: "revoked" }, { status: 200 });
}
