/**
 * GET /api/auth/accounts — List active and stashed accounts.
 *
 * Returns [{userId, email, displayName, isAdmin, active, status}] from the bundle.
 * Requires session-only auth (method==="account"). Tokens/JTI are never returned.
 * Stashed entries with status "locked" (DEK evicted) are included.
 * No cache headers (fresh on every request).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { readBundle } from "@/lib/auth/session-bundle";

export async function GET(request: NextRequest) {
  // Require session-only auth (no API keys, no Bearer tokens)
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return authResult.response;
  }

  // Only allow account strategy (session cookies), not API keys
  if (authResult.context?.method !== "account") {
    return NextResponse.json(
      { error: "Session authentication required" },
      { status: 403 }
    );
  }

  try {
    const { active, stash } = await readBundle(request);

    const accounts = [];
    if (active) {
      accounts.push({
        userId: active.userId,
        email: active.email,
        displayName: active.displayName,
        isAdmin: active.isAdmin,
        active: true,
        status: active.status,
      });
    }

    for (const entry of stash) {
      accounts.push({
        userId: entry.userId,
        email: entry.email,
        displayName: entry.displayName,
        isAdmin: entry.isAdmin,
        active: false,
        status: entry.status,
      });
    }

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("[/api/auth/accounts]", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
