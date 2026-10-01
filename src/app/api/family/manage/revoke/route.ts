/**
 * POST /api/family/manage/revoke
 *
 * Revoke a share (owner) or leave it (viewer).
 *
 * Owner with an unlocked session: ONE transaction -> status revoked, grants deleted, every
 * section the viewer held a key for is rotated (rotateEpoch), then syncFamilyLabels re-seals the
 * remaining viewers and rebuilds the sidecar. Rotation failure rolls the whole revoke back.
 * Viewer-initiated (or locked owner): status revoked, the viewer's grant rows are kept as the
 * rotation marker and the owner's next sweep rotates them (response rotation: "deferred").
 *
 * Auth: session-only. Body (strict): { shareId }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserById } from "@/lib/auth/queries";
import { revokeFamilyShare } from "@/lib/family/manage-ops";
import { sendEmail, familyShareRevokedEmail, familyShareEndedEmail } from "@/lib/email";
import { manageLimit, readStrictBody, requireFamilySession } from "@/lib/family/manage-guard";

export const dynamic = "force-dynamic";

const RevokeRequestSchema = z.object({ shareId: z.string().uuid() }).strict();

export async function POST(request: NextRequest) {
  const guard = await requireFamilySession(request);
  if (!guard.ok) return guard.response;
  const { userId: actorId, dek } = guard.ctx;

  const limited = manageLimit(actorId);
  if (limited) return limited;

  const body = await readStrictBody(request, RevokeRequestSchema);
  if (!body.ok) return body.response;

  let result;
  try {
    result = await revokeFamilyShare({ shareId: body.data.shareId, actorId, actorDek: dek });
  } catch {
    console.error("[family] revoke failed (rolled back)");
    return NextResponse.json({ error: "Could not revoke share" }, { status: 500 });
  }
  if (!result.ok) {
    return result.code === "not_found"
      ? NextResponse.json({ error: "Share not found" }, { status: 404 })
      : NextResponse.json({ error: "Share cannot be revoked in its current state" }, { status: 409 });
  }

  // Notifications (non-fatal, display names only).
  try {
    const { share } = result;
    if (result.actor === "owner" && share.viewerId) {
      const [viewer, owner] = await Promise.all([getUserById(share.viewerId), getUserById(share.ownerId)]);
      if (viewer?.email) {
        await sendEmail({
          ...familyShareRevokedEmail(owner?.displayName || "Someone"),
          to: viewer.email,
        });
      }
      if (result.suspendedParentOwnerId) {
        const parentOwner = await getUserById(result.suspendedParentOwnerId);
        if (parentOwner?.email) {
          await sendEmail({
            ...familyShareEndedEmail(owner?.displayName || "Someone", "suspended"),
            to: parentOwner.email,
          });
        }
      }
    } else if (result.actor === "viewer") {
      const [owner, viewer] = await Promise.all([getUserById(share.ownerId), getUserById(actorId)]);
      if (owner?.email) {
        await sendEmail({
          ...familyShareEndedEmail(viewer?.displayName || "Someone", "left"),
          to: owner.email,
        });
      }
    }
  } catch (err) {
    console.error("[family] revoke notification failed:", err instanceof Error ? err.name : "error");
  }

  return NextResponse.json({ status: "revoked", rotation: result.rotation }, { status: 200 });
}
