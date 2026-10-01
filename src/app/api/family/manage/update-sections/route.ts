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
import { verifyPassword } from "@/lib/auth";
import { isFreshSession } from "@/lib/auth/step-up";
import { updateFamilyShareSections } from "@/lib/family/manage-ops";
import { FamilySectionSchema } from "@/lib/family/sections";
import { familyShares } from "@/db/schema-pg";
import { db } from "@/db";
import { manageLimit, readStrictBody, requireFamilySession, toShareDto } from "@/lib/family/manage-guard";

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
  const { userId: ownerId, dek, iat } = guard.ctx;

  const limited = manageLimit(ownerId);
  if (limited) return limited;

  const body = await readStrictBody(request, UpdateSectionsSchema);
  if (!body.ok) return body.response;
  const { shareId, sections: newSections, currentPassword } = body.data;

  // Check if this is a widening (adding sections)
  const [share] = await db
    .select()
    .from(familyShares)
    .where(and(eq(familyShares.id, shareId), eq(familyShares.ownerId, ownerId)))
    .limit(1);

  if (share) {
    const currentSectionSet = new Set(share.sections);
    const newSectionSet = new Set(newSections);
    const isWidening = Array.from(newSectionSet).some((s) => !currentSectionSet.has(s));

    if (isWidening) {
      // Step-up: require fresh session (< 10 min) OR currentPassword
      const isFresh = isFreshSession(iat);
      if (!isFresh && !currentPassword) {
        return NextResponse.json(
          { error: "Step-up required: provide currentPassword or use a fresh session" },
          { status: 401 },
        );
      }

      // If not fresh, verify the password
      if (!isFresh) {
        if (!currentPassword) {
          return NextResponse.json({ error: "Password required for step-up" }, { status: 401 });
        }
        const ownerUser = await getUserById(ownerId);
        if (!ownerUser || !ownerUser.passwordHash) {
          return NextResponse.json({ error: "Cannot verify password" }, { status: 401 });
        }
        const passwordValid = await verifyPassword(currentPassword, ownerUser.passwordHash);
        if (!passwordValid) {
          return NextResponse.json({ error: "Invalid password" }, { status: 401 });
        }
      }
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
  return NextResponse.json(toShareDto(result.share, "owner", viewer?.displayName ?? null), { status: 200 });
}
