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
import { z } from "zod";
import { hasNonCookieCredential, loadBundle, clearAddIntent, ADD_INTENT_COOKIE, MAX_ACCOUNTS } from "@/lib/auth/session-bundle";
import { signShortLived } from "@/lib/auth/jwt";
import { logApiError, safeErrorMessage } from "@/lib/validate";

// Optional body: {userId} = re-sign-in of an account ALREADY in the bundle
// (locked / needs_login). That replaces its own entry, so the cap never blocks it.
const bodySchema = z.object({ userId: z.string().min(1).max(254) }).strict();

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
    let reauthUserId: string | null = null;
    const raw = await request.text();
    if (raw.trim()) {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
      const parsed = bodySchema.safeParse(json);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      reauthUserId = parsed.data.userId;
    }
    const inBundle =
      reauthUserId !== null && (active.userId === reauthUserId || stash.some((m) => m.userId === reauthUserId));
    if (1 + stash.length >= MAX_ACCOUNTS && !inBundle) {
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

/**
 * DELETE /api/auth/add-intent — Cancel the add flow: clears `pf_add`.
 * Session-only + middleware CSRF (Origin/Referer) like POST. Touches no session.
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) return authResult.response;
  if (authResult.context.method !== "account" || hasNonCookieCredential(request)) {
    return NextResponse.json({ error: "Session authentication required" }, { status: 403 });
  }
  const response = NextResponse.json({ status: "cancelled" }, { headers: { "Cache-Control": "no-store" } });
  clearAddIntent(response);
  return response;
}
