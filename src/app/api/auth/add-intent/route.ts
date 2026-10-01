/**
 * POST /api/auth/add-intent — Initiate "add another account" flow.
 *
 * Requires session-only auth (method==="account", not pending).
 * No body required.
 *
 * Pre-conditions:
 * - Active session must exist
 * - Count of active + stash must be < 5 (cap enforced here, also in login/mfa/register/google)
 *
 * On success: sets pf_add cookie (short-lived 10 min, httpOnly, Path=/api/auth, Lax).
 * Any login route (password/MFA/Google/register/zero-click) sees the cookie and
 * commits via the multi-account helper instead of replacing.
 *
 * Response: {status:"ready"}, client shows "Adding account N of 5" UI.
 * On cap exceeded: {error:"account_cap"}, 409.
 *
 * CSRF: middleware Origin/Referer check applies.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { readBundle } from "@/lib/auth/session-bundle";
import { signShortLived } from "@/lib/auth/jwt";
import { logApiError, safeErrorMessage } from "@/lib/validate";

export async function POST(request: NextRequest) {
  // Require session-only auth (method==="account", not pending)
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return authResult.response;
  }

  // Only allow account strategy (session cookies), not API keys
  const auth = authResult.context;
  if (auth?.method !== "account") {
    return NextResponse.json(
      { error: "Session authentication required" },
      { status: 403 }
    );
  }
  // Note: AccountStrategy already rejects pending tokens before returning to us

  try {
    const { active, stash } = await readBundle(request);

    // Cap at 5 total (active + stash)
    const total = (active ? 1 : 0) + stash.length;
    if (total >= 5) {
      return NextResponse.json(
        { error: "Account capacity reached (5 accounts maximum)" },
        { status: 409 }
      );
    }

    // Create short-lived add-intent token (10 min)
    const token = await signShortLived(
      { activeJti: active?.jti },
      600, // 10 minutes
      "add-account"
    );

    const response = NextResponse.json({ status: "ready" });

    // Set the pf_add cookie
    response.cookies.set("pf_add", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/add-intent", error);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to initiate add account") },
      { status: 500 }
    );
  }
}
