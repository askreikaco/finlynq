/**
 * GET /api/auth/google/start?intent=login|link&next=/...
 *
 * Initiates Google OAuth flow. Generates PKCE code_verifier,
 * state and nonce, stores them in a signed cookie, and redirects
 * to Google's authorization endpoint.
 *
 * Rate limit: 10/60s per IP (start is cheap; callback is the bottleneck).
 * Prefetch guard: skips if no Auth header (prevents noisy prefetch requests).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isGoogleConfigured,
  buildAuthUrl,
  generateCodeVerifier,
  generateCodeChallenge,
} from "@/lib/auth/google-oidc";
import { signShortLived } from "@/lib/auth/jwt";
import { requireAuth } from "@/lib/auth";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { isPrefetchRequest } from "@/lib/auth/google-prefetch";

/**
 * Check if a URL is safe for redirect.
 */
function isSafeNext(next: string | null | undefined): next is string {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  if (next.includes("\\")) return false;
  return true;
}

export async function GET(req: NextRequest) {
  // Guard against noisy prefetch requests
  if (isPrefetchRequest(req.headers)) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 }
    );
  }

  // Google must be configured
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google sign-in is not configured" },
      { status: 404 }
    );
  }

  // Rate limit by IP
  const ip = clientIp(req);
  const rateLimit = checkRateLimit(`google:start:${ip}`, 10, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const url = new URL(req.url);
  const intent = url.searchParams.get("intent");
  const next = url.searchParams.get("next");

  if (intent !== "login" && intent !== "link") {
    return NextResponse.json(
      { error: "Invalid intent" },
      { status: 400 }
    );
  }

  // If intent=link, require authentication
  let uid: string | undefined;
  if (intent === "link") {
    const auth = await requireAuth(req);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    uid = auth.context.userId;
  }

  // Validate next URL
  if (next && !isSafeNext(next)) {
    return NextResponse.json(
      { error: "Invalid redirect URL" },
      { status: 400 }
    );
  }

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Generate state and nonce
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");

  // Sign the state cookie with state, nonce, code_verifier, intent, next, and optionally uid
  const payload: Record<string, unknown> = {
    state,
    nonce,
    codeVerifier,
    intent,
  };
  if (next) payload.next = next;
  if (uid) payload.uid = uid;

  const stateToken = await signShortLived(payload, 600, "oauth-state"); // 10 min

  // Build the Google auth URL
  const authUrl = await buildAuthUrl({
    state,
    nonce,
    codeChallenge,
  });

  // Set the signed state cookie and redirect
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("pf_oauth_state", stateToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 min
    path: "/",
  });

  return response;
}
