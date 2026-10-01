/**
 * POST /api/auth/switch — Switch the active account to a stashed one.
 *
 * POST only (other methods 405 by the framework). Session-cookie auth only
 * (no Bearer / API key). Middleware Origin/Referer CSRF check applies (route
 * is NOT in CSRF_BYPASS_PATHS); Content-Type must be JSON.
 * Body: {userId} strict.
 *
 * The target token is RE-VERIFIED on every switch (signature, deploy-gen,
 * revocation denylist, session_not_before cutoff, exp) and its DEK must still
 * be cached. This route never mints a token and never returns one.
 *   not in bundle / unknown -> 404 (identical body)
 *   dead (expired/revoked/cutoff) -> pruned, then 404 (same as unknown)
 *   DEK evicted -> 409 needs_login
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { activate, applySwitch, hasNonCookieCredential, writeStash } from "@/lib/auth/session-bundle";
import { getUserById, listIdentities } from "@/lib/auth/queries";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";

const switchSchema = z
  .object({
    userId: z.string().min(1, "User ID is required").max(254),
  })
  .strict();

const NOT_FOUND = { error: "Account not found or not available" };

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) return authResult.response;
  const auth = authResult.context;
  if (auth.method !== "account" || hasNonCookieCredential(request)) {
    return NextResponse.json({ error: "Session authentication required" }, { status: 403 });
  }

  const ctype = request.headers.get("content-type") ?? "";
  if (!ctype.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  const userLimit = checkRateLimit(`switch:${auth.userId}`, 30, 60_000);
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: "Too many switch attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((userLimit.resetAt - Date.now()) / 1000)) } },
    );
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipLimit = checkRateLimit(`switch:ip:${ip}`, 60, 60_000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many switch attempts from this IP. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((ipLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = validateBody(body, switchSchema);
    if (parsed.error) return parsed.error;
    const targetUserId = parsed.data.userId;

    const noStore = { "Cache-Control": "no-store" };
    const outcome = await activate(request, targetUserId);

    if (outcome.result === "not_found") {
      const nf = NextResponse.json(NOT_FOUND, { status: 404, headers: noStore });
      if (outcome.stash) writeStash(nf, outcome.stash);
      return nf;
    }
    if (outcome.result === "needs_login") {
      const user = await getUserById(targetUserId).catch(() => null);
      let googleLinked = false;
      try {
        googleLinked = (await listIdentities(targetUserId)).some((i) => i.provider === "google");
      } catch {
        /* advisory only */
      }
      const nl = NextResponse.json(
        {
          status: "needs_login",
          email: user?.email ?? null,
          hasPassword: Boolean(user?.passwordHash),
          googleLinked,
        },
        { status: 409, headers: noStore },
      );
      if (outcome.stash) writeStash(nl, outcome.stash);
      return nl;
    }
    const response = NextResponse.json({ status: "switched" }, { headers: noStore });
    applySwitch(response, outcome);
    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/switch", error);
    return NextResponse.json({ error: safeErrorMessage(error, "Switch failed") }, { status: 500 });
  }
}
