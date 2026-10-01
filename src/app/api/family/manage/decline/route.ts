/**
 * POST /api/family/manage/decline
 *
 * Decline a pending share invitation. Moves the share to "declined" status.
 * Only the invited viewer can decline.
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
import { getShareById, updateShareStatus } from "@/lib/family/share-dal";

export const dynamic = "force-dynamic";

const DeclineRequestSchema = z
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

  const { userId: viewerId } = auth.context;

  // Step 2: Get viewer's verified email
  const viewer = await getUserById(viewerId);
  if (!viewer || !viewer.emailVerified || !viewer.email) {
    return NextResponse.json(
      { error: "Email must be verified" },
      { status: 403 }
    );
  }

  // Step 3: Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = DeclineRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { shareId } = parsed.data;

  // Step 4: Get the share
  const share = await getShareById(db, shareId, viewerId);
  const viewerEmailLower = viewer.email?.toLowerCase();
  if (!viewerEmailLower) {
    return NextResponse.json(
      { error: "Email not found" },
      { status: 403 }
    );
  }
  if (!share) {
    return NextResponse.json(
      { error: "Share not found" },
      { status: 404 }
    );
  }

  // Step 5: Verify the viewer can decline (must be pending and addressed to viewer's email)
  if (share.status !== "pending" || share.viewerEmailLower !== viewerEmailLower) {
    return NextResponse.json(
      { error: "Cannot decline this share" },
      { status: 409 }
    );
  }

  // Step 6: Update status to declined
  try {
    await updateShareStatus(db, shareId, "declined", viewerId);
  } catch (err) {
    console.error("[family] decline failed:", err);
    return NextResponse.json(
      { error: "Could not decline share" },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "declined" }, { status: 200 });
}
