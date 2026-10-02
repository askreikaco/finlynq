/**
 * GET /api/user/me — Return current user profile including onboarding status.
 * Used by the dashboard to decide whether to show the onboarding wizard.
 *
 * PATCH /api/user/me — Update user profile fields (displayName, phone, avatarUrl).
 * Postgres managed mode only. Returns the updated profile.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getDialect, db, schema } from "@/db";
import { getUserById } from "@/lib/auth/queries";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { userId, method } = auth.context;

  // Self-hosted users don't have a user record — onboarding always done
  if (method === "passphrase" || getDialect() !== "postgres") {
    return NextResponse.json({
      userId,
      username: null,
      email: null,
      displayName: null,
      phone: null,
      avatarUrl: null,
      onboardingComplete: true,
    });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    userId,
    username: user.username ?? null,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    onboardingComplete: user.onboardingComplete === 1,
  });
}

const patchSchema = z.object({
  displayName: z.string().trim().max(80).or(z.null()).optional(),
  phone: z.string()
    .trim()
    .max(32)
    .regex(/^[+0-9 ()-]*$/, "Phone can only contain +, digits, spaces, parentheses, and hyphens")
    .or(z.null())
    .optional(),
  avatarUrl: z.string()
    .max(140000)
    .regex(/^data:image\/(jpeg|png);base64,.+$/, "Avatar must be a JPEG or PNG data URI")
    .or(z.null())
    .optional(),
});

export async function PATCH(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Profile updates are only available in managed mode." },
      { status: 403 }
    );
  }

  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId, method } = auth.context;
  if (method === "passphrase") {
    return NextResponse.json(
      { error: "Profile updates are only available in managed mode." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = validateBody(body, patchSchema);
    if (parsed.error) return parsed.error;

    const { displayName, phone, avatarUrl } = parsed.data;

    // Build update object with only provided fields
    const updates: Record<string, string | null | undefined> = {};
    if (displayName !== undefined) {
      updates.displayName = displayName ? displayName.trim() : null;
    }
    if (phone !== undefined) {
      updates.phone = phone ? phone.trim() : null;
    }
    if (avatarUrl !== undefined) {
      updates.avatarUrl = avatarUrl;
    }

    // If nothing to update, return current profile
    if (Object.keys(updates).length === 0) {
      const user = await getUserById(userId);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({
        userId,
        username: user.username ?? null,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        phone: user.phone ?? null,
        avatarUrl: user.avatarUrl ?? null,
        onboardingComplete: user.onboardingComplete === 1,
      });
    }

    // Update user record
    await db
      .update(schema.users)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.users.id, userId));

    // Return updated profile
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      userId,
      username: user.username ?? null,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      onboardingComplete: user.onboardingComplete === 1,
    });
  } catch (error: unknown) {
    await logApiError("PATCH", "/api/user/me", error, auth.context.userId);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to update profile") },
      { status: 500 }
    );
  }
}
