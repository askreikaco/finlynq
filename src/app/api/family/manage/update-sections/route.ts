/**
 * PUT /api/family/manage/update-sections
 *
 * Owner replaces the sections of a share (widen and/or narrow) in ONE transaction:
 *  - widening seals ONLY the added sections, ONLY to this share's viewer
 *  - narrowing rotates every dropped section the viewer held a key for, then re-seals the rest
 *  - a reciprocal share cannot shrink below its must-share-back parent's requirement (409)
 *
 * Auth: session-only, owner only. Step-up: required when widening (adding sections).
 * Body (strict): { shareId, sections[], currentPassword? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getUserById } from "@/lib/auth/queries";
import { updateFamilyShareSections } from "@/lib/family/manage-ops";
import { FamilySectionSchema, resolveSections } from "@/lib/family/sections";
import { familyShares } from "@/db/schema-pg";
import { db } from "@/db";
import { manageLimit, readStrictBody, requireFamilySession, requireFamilyStepUp, toShareDto } from "@/lib/family/manage-guard";

export const dynamic = "force-dynamic";

const UpdateSectionsSchema = z
  .object({
    shareId: z.string().uuid(),
    sections: z.array(FamilySectionSchema).min(1),
    currentPassword: z.string().optional(),
  })
  .strict();

export async function PUT(request: NextRequest) {
  const guard = await requireFamilySession(request);
  if (!guard.ok) return guard.response;
  const { userId: ownerId, dek } = guard.ctx;

  const limited = manageLimit(ownerId);
  if (limited) return limited;

  const body = await readStrictBody(request, UpdateSectionsSchema);
  if (!body.ok) return body.response;
  const { shareId, sections: newSections, currentPassword } = body.data;

  // Widening (adding any section the share does not resolve to today) needs step-up.
  const [share] = await db
    .select()
    .from(familyShares)
    .where(and(eq(familyShares.id, shareId), eq(familyShares.ownerId, ownerId)))
    .limit(1);
  if (share) {
    const current = new Set<string>(resolveSections(share.allSections, share.sections));
    if (newSections.some((s) => !current.has(s))) {
      const stepUp = await requireFamilyStepUp(guard.ctx, currentPassword);
      if (stepUp) return stepUp;
    }
  }

  let result;
  try {
    result = await updateFamilyShareSections({
      shareId: body.data.shareId,
      ownerId,
      sections: body.data.sections,
      ownerDek: dek,
    });
  } catch {
    console.error("[family] update-sections failed (rolled back)");
    return NextResponse.json({ error: "Could not update sections" }, { status: 500 });
  }

  if (!result.ok) {
    switch (result.code) {
      case "not_found":
        return NextResponse.json({ error: "Share not found" }, { status: 404 });
      case "locked":
        return NextResponse.json({ error: "Session locked. Please sign in again." }, { status: 423 });
      case "required_back":
        return NextResponse.json(
          { error: "Cannot remove sections required for must-share-back", requiredSections: result.requiredSections },
          { status: 409 },
        );
      default:
        return NextResponse.json({ error: "Share cannot be changed in its current state" }, { status: 409 });
    }
  }

  const viewer = result.share.viewerId ? await getUserById(result.share.viewerId) : null;
  return NextResponse.json(
    toShareDto(result.share, "owner", viewer?.displayName ?? null, result.reconsentMissing),
    { status: 200 },
  );
}
