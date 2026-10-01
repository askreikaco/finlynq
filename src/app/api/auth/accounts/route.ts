/**
 * GET /api/auth/accounts — List the browser's signed-in accounts.
 *
 * Session-cookie auth only. Returns [{userId,email,displayName,isAdmin,active,status}]
 * with identity from the DB. NEVER returns tokens, jtis or any credential
 * material. Dead/tampered stash entries are pruned from the cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasNonCookieCredential, listAccounts, writeStash } from "@/lib/auth/session-bundle";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) return authResult.response;
  if (authResult.context.method !== "account" || hasNonCookieCredential(request)) {
    return NextResponse.json({ error: "Session authentication required" }, { status: 403 });
  }

  try {
    const { accounts, bundle } = await listAccounts(request);
    const response = NextResponse.json(accounts, { headers: { "Cache-Control": "no-store" } });
    if (bundle.pruned) writeStash(response, bundle.stash.map((m) => m.token));
    return response;
  } catch (error) {
    console.error("[/api/auth/accounts]", error instanceof Error ? error.message : "error");
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
