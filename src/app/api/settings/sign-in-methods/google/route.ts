/**
 * DELETE /api/settings/sign-in-methods/google (requireAuth)
 *
 * Unlinks a Google account. Requires password verification.
 *
 * Body: {password: string 1..256}
 * Response: 200 {ok:true} | 401 {error:"Invalid password"} | 400 {error}
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { getUserById, deleteIdentities } from "@/lib/auth/queries";
import { verifyPassword } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const userId = auth.context.userId!;

  // Parse and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bodySchema = z.object({
    password: z.string().min(1).max(256),
  });
  const validation = bodySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const password = validation.data.password;

  try {
    // Fetch the user to get password hash
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // Delete the Google identity
    await deleteIdentities(userId, "google");

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error unlinking Google account:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
