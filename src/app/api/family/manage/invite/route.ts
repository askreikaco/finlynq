/**
 * POST /api/family/manage/invite
 *
 * Invite a new viewer to share selected sections. Creates:
 * 1. A pending share record (owner_id, viewer_email, sections)
 * 2. An invite record with a single-use 7-day token
 * 3. Sends an email to the viewer
 *
 * Auth: Session-only (method==="account"); API key returns 403.
 * Rate limits: 10 invites per user per day, 3 invites per email per day.
 * Zod strict: no extra fields.
 *
 * On success: 201 with share ID.
 * Errors: 400 (validation), 401 (auth), 403 (API key), 409 (conflict), 429 (rate limit), 500 (email).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { getUserById } from "@/lib/auth/queries";
import { createShare } from "@/lib/family/share-dal";
import { createUserKeypairIfNeeded } from "@/lib/family/grant";
import { generateInviteToken, hashInviteToken, getInviteExpiresAt } from "@/lib/family/invite-token";
import { familyInvites } from "@/db/schema-pg";
import { sendEmail, familyInviteEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const InviteRequestSchema = z
  .object({
    viewerEmail: z.string().email().toLowerCase(),
    sections: z.array(z.string()).min(1),
    mustShareBack: z.boolean().optional().default(false),
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

  const { userId: ownerId } = auth.context;

  // Step 2: Rate limits
  const rateLimitUser = checkRateLimit(
    `family-invite-user:${ownerId}`,
    10,
    24 * 60 * 60_000 // 10 per day
  );
  if (!rateLimitUser.allowed) {
    return NextResponse.json(
      { error: "Invite rate limit exceeded. Try again tomorrow." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimitUser.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  // Step 3: Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = InviteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { viewerEmail, sections, mustShareBack } = parsed.data;

  // Step 4: Rate limit per email
  const rateLimitEmail = checkRateLimit(
    `family-invite-email:${viewerEmail}`,
    3,
    24 * 60 * 60_000 // 3 per day
  );
  if (!rateLimitEmail.allowed) {
    // No enumeration: same response as if the email rate-limit passed but invite creation failed.
    // Rate limits are not secret; don't leak that this email was invited before.
    return NextResponse.json(
      { error: "This email has received too many invitations. Try again tomorrow." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimitEmail.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  // Step 5: Ensure owner has a keypair (needed for grant encryption later)
  const ownerDek = auth.context.dek;
  if (!ownerDek) {
    return NextResponse.json(
      { error: "Session locked. Please sign in again." },
      { status: 423 }
    );
  }

  try {
    await createUserKeypairIfNeeded(db, ownerId, ownerDek);
  } catch (err) {
    console.error("[family] keypair creation failed:", err);
    return NextResponse.json(
      { error: "Could not set up encryption" },
      { status: 500 }
    );
  }

  // Step 6: Create share and invite records
  let shareId: string;
  try {
    shareId = await createShare(db, ownerId, viewerEmail, sections, mustShareBack);
  } catch (err) {
    console.error("[family] share creation failed:", err);
    return NextResponse.json(
      { error: "Could not create share" },
      { status: 500 }
    );
  }

  // Step 7: Create invite record
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = getInviteExpiresAt();

  try {
    await db
      .insert(familyInvites)
      .values({
        shareId,
        emailLower: viewerEmail,
        tokenHash,
        expiresAt,
      });
  } catch (err) {
    console.error("[family] invite creation failed:", err);
    return NextResponse.json(
      { error: "Could not create invite" },
      { status: 500 }
    );
  }

  // Step 8: Get owner name for email
  const owner = await getUserById(ownerId);
  if (!owner) {
    console.error("[family] owner not found:", ownerId);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }

  const inviterName = owner.displayName || owner.email || "Someone";

  // Step 9: Send invite email
  const acceptUrl = `${process.env.APP_URL || "http://localhost:3000"}/family/accept?token=${encodeURIComponent(token)}`;
  const emailMsg = familyInviteEmail(inviterName, acceptUrl);

  try {
    await sendEmail({
      ...emailMsg,
      to: viewerEmail,
    });
  } catch (err) {
    console.error("[family] email send failed:", err);
    // Email failure is not fatal — the invite record exists, it just won't be delivered.
    // The user can resend from the sharing tab.
  }

  return NextResponse.json(
    { shareId },
    { status: 201 }
  );
}
