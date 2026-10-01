/**
 * POST /api/auth/add-intent — Begin the "add another account" flow.
 *
 * Session-cookie auth only (active, non-pending; AccountStrategy rejects
 * pending on every route but mfa/verify). Middleware CSRF check applies.
 * Requires total accounts < 5 (409 account_cap); commitSession also enforces
 * the cap at commit time by evicting+revoking the oldest stash entry.
 * Sets `pf_add` (signed, purpose add-account, bound to the ACTIVE jti, 10 min,
 * httpOnly, Path=/api/auth, Lax). Any login commit reads + clears it.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasNonCookieCredential, loadBundle, ADD_INTENT_COOKIE, MAX_ACCOUNTS } from "@/lib/auth/session-bundle";
import { signShortLived } from "@/lib/auth/jwt";
import { logApiError, safeErrorMessage } from "@/lib/validate";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) return authResult.response;
  if (authResult.context.method !== "account" || hasNonCookieCredential(request)) {
    return NextResponse.json({ error: "Session authentication required" }, { status: 403 });
  }

  try {
    const { active, stash } = await loadBundle(request, { checkUsers: true });
    if (!active) {
      return NextResponse.json({ error: "Session authentication required" }, { status: 403 });
    }
    if (1 + stash.length >= MAX_ACCOUNTS) {
      return NextResponse.json({ error: "account_cap" }, { status: 409 });
    }

    const token = await signShortLived({ activeJti: active.jti }, 600, "add-account");
    const response = NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(ADD_INTENT_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/add-intent", error);
    return NextResponse.json({ error: safeErrorMessage(error, "Failed to initiate add account") }, { status: 500 });
  }
}
