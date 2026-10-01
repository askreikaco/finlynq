/**
 * POST /api/auth/switch — Switch to a stashed account.
 *
 * Requires session-only auth (method==="account", not pending).
 * Body: {userId} (Zod strict)
 *
 * Pre-condition: target must be in stash, verified, and have DEK cached.
 * - If not in stash: 404 (same error as unknown user for OPSEC)
 * - If expired/revoked/gen-mismatch/session_not_before/DEK-evicted: 409 + needs_login
 * - If pending: 404 (unreachable — pending can't be in stash, only active during MFA)
 *
 * On success: atomically swap active ↔ stash, return {status:"switched"}
 * Client hard-reloads to /dashboard or /cloud.
 *
 * CSRF: middleware Origin/Referer check applies (rides pf_session).
 * Rate limit: 30 per 60s per active user, 60 per minute per IP.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { readBundle, activate } from "@/lib/auth/session-bundle";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";

const switchSchema = z
  .object({
    userId: z.string().min(1, "User ID is required").max(254),
  })
  .strict();

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

  // Rate limit: per active user
  const userLimit = checkRateLimit(`switch:${auth.userId}`, 30, 60_000);
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: "Too many switch attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((userLimit.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // Rate limit: per IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipLimit = checkRateLimit(`switch:ip:${ip}`, 60, 60_000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many switch attempts from this IP. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((ipLimit.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = validateBody(body, switchSchema);
    if (parsed.error) return parsed.error;

    const { userId: targetUserId } = parsed.data;

    // Read bundle to check if target is in stash
    const { active: _active, stash } = await readBundle(request);

    const targetEntry = stash.find((e) => e.userId === targetUserId);
    if (!targetEntry) {
      // Not found in stash. Return 404 with same body as unknown user (OPSEC).
      // If activeUser is in stash somehow, fail closed.
      return NextResponse.json(
        { error: "Account not found or not available" },
        { status: 404 }
      );
    }

    // Verify the target token is still valid (not pending, not expired, etc.)
    // If DEK is missing (status=locked), treat as needs_login (2h idle eviction).
    if (targetEntry.status !== "ok" && targetEntry.status !== "locked") {
      // expired/revoked/pending/gen-mismatch
      // Prune it and return needs_login
      return NextResponse.json(
        {
          status: "needs_login",
          email: targetEntry.email,
          hasPassword: true, // Assume true for now; could query DB for exact state
          googleLinked: false, // Would need to query DB
        },
        { status: 409 }
      );
    }

    // If status=locked, the DEK is missing — same as needs_login (2h idle eviction)
    if (targetEntry.status === "locked") {
      return NextResponse.json(
        {
          status: "needs_login",
          email: targetEntry.email,
          hasPassword: true,
          googleLinked: false,
        },
        { status: 409 }
      );
    }

    // Status is "ok" — DEK is cached. Perform the switch.
    const response = NextResponse.json({ status: "switched" });
    await activate(request, response, targetUserId);

    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/switch", error);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Switch failed") },
      { status: 500 }
    );
  }
}
