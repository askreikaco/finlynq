/**
 * PUT /api/family/manage/update-sections
 *
 * Update the sections granted to a share (widen or narrow).
 * - Widening: creates new section keys (if needed) and seals to the viewer
 * - Narrowing: removes grants for dropped sections
 * - If shrinking below required_back_sections, returns 409
 *
 * Auth: Session-only (method==="account"); API key returns 403. Owner only.
 * Zod strict: no extra fields.
 *
 * On success: 200 with updated share.
 * Errors: 400 (validation), 401 (auth), 403 (API key), 404 (not found),
 *         409 (conflict / constraint violation), 500 (error).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { getShareById } from "@/lib/family/share-dal";
import { syncFamilyLabels } from "@/lib/family/sweep";
import { FamilySectionSchema, type FamilySection } from "@/lib/family/sections";
import { familyShares } from "@/db/schema-pg";

export const dynamic = "force-dynamic";

const UpdateSectionsSchema = z
  .object({
    shareId: z.string().uuid(),
    sections: z.array(FamilySectionSchema).min(1),
  })
  .strict();

export async function PUT(request: NextRequest) {
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

  const parsed = UpdateSectionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { shareId, sections } = parsed.data;

  // Step 3: Get the share (must be owned by this user)
  const share = await getShareById(db, shareId, ownerId);
  if (!share) {
    return NextResponse.json(
      { error: "Share not found" },
      { status: 404 }
    );
  }

  if (share.ownerId !== ownerId) {
    return NextResponse.json(
      { error: "Only the owner can update sections" },
      { status: 403 }
    );
  }

  // Step 4: Check must-share-back constraint
  const requiredBackSections = (share.requiredBackSections || []) as string[];
  if (requiredBackSections.length > 0) {
    const newSections = new Set(sections as string[]);
    const missingRequired = requiredBackSections.some((s) => !newSections.has(s as string));
    if (missingRequired) {
      return NextResponse.json(
        {
          error: "Cannot remove sections required for must-share-back",
          requiredSections: requiredBackSections,
        },
        { status: 409 }
      );
    }
  }

  // Step 5: Ensure owner has DEK
  const ownerDek = auth.context.dek;
  if (!ownerDek) {
    return NextResponse.json(
      { error: "Session locked. Please sign in again." },
      { status: 423 }
    );
  }

  // Step 6: Update share sections and sync labels
  try {
    await db
      .update(familyShares)
      .set({
        sections: sections as string[],
        allSections: false,
      })
      .where(eq(familyShares.id, shareId));

    // Sweep labels for the new sections (provisions grants)
    const sectionsList = sections.filter((s): s is FamilySection =>
      ["accounts", "net_worth", "investments", "goals", "budgets", "loans", "cashflow"].includes(s)
    );
    await syncFamilyLabels(db, ownerId, ownerDek, { sections: sectionsList });
  } catch (err) {
    console.error("[family] update sections failed:", err);
    return NextResponse.json(
      { error: "Could not update sections" },
      { status: 500 }
    );
  }

  // Step 7: Return updated share
  const updated = await getShareById(db, shareId, ownerId);
  if (!updated) {
    return NextResponse.json(
      { error: "Share not found after update" },
      { status: 500 }
    );
  }

  return NextResponse.json(updated, { status: 200 });
}
