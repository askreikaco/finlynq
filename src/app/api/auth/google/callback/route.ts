/**
 * GET /api/auth/google/callback?code=...&state=...&error=...
 *
 * Google OAuth callback. Validates the authorization code and state,
 * exchanges it for an ID token, and resolves the identity.
 *
 * Paths:
 * - Known user with device cookie → session (no password)
 * - Known user no device → unlock cookie (password once)
 * - Verified email match → unlock cookie (password once, then link)
 * - Unknown → signup cookie (skip verify mail)
 * - intent=link → upsert identity for current user
 * - Error → /cloud?error=google_<code>
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isGoogleConfigured,
  exchangeCode,
  verifyIdToken,
} from "@/lib/auth/google-oidc";
import { verifyShortLived, signShortLived, revokeJti, createSessionToken } from "@/lib/auth/jwt";
import { redeemDevice, issueDevice } from "@/lib/auth/trusted-device";
import { upsertIdentity, getUserByEmail } from "@/lib/auth/queries";
import { issueSessionForDek } from "@/lib/auth/finish-login";
import { checkRateLimit } from "@/lib/rate-limit";

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

function redirectToCloud(query: Record<string, string>): NextResponse {
  const url = new URL("/cloud", process.env.APP_URL || "http://localhost:3000");
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  // Google must be configured
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 404 });
  }

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for") || "0.0.0.0";
  const rateLimit = checkRateLimit(`google:callback:${ip}`, 10, 60_000);
  if (!rateLimit.allowed) {
    return redirectToCloud({ error: "google_rate_limit" });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Google returned an error
  if (error) {
    const errorCode = error === "access_denied" ? "denied" : "server_error";
    return redirectToCloud({ error: `google_${errorCode}` });
  }

  if (!code || !state) {
    return redirectToCloud({ error: "google_missing_params" });
  }

  // Read and verify the state cookie
  const stateToken = req.cookies.get("pf_oauth_state")?.value;
  if (!stateToken) {
    return redirectToCloud({ error: "google_no_state" });
  }

  const statePayload = await verifyShortLived(stateToken);
  if (!statePayload) {
    return redirectToCloud({ error: "google_invalid_state" });
  }

  // Verify state parameter matches (constant-time)
  const expectedState = statePayload.state as string;
  if (!constantTimeEqual(state, expectedState)) {
    return redirectToCloud({ error: "google_state_mismatch" });
  }

  const nonce = statePayload.nonce as string;
  const codeVerifier = statePayload.codeVerifier as string;
  const intent = statePayload.intent as string;
  const next = statePayload.next as string | undefined;
  const uid = statePayload.uid as string | undefined;

  // Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeCode({ code, codeVerifier });
  } catch (e) {
    console.error("Token exchange failed:", e);
    return redirectToCloud({ error: "google_exchange_failed" });
  }

  // Verify ID token
  const claims = await verifyIdToken(tokens.id_token, nonce);
  if (!claims) {
    return redirectToCloud({ error: "google_token_invalid" });
  }

  const googleSub = claims.sub;
  const googleEmail = claims.email;
  const googleEmailVerified = claims.email_verified;

  // Clear the state cookie
  const response = NextResponse.redirect(
    new URL("/cloud", process.env.APP_URL || "http://localhost:3000")
  );
  response.cookies.delete("pf_oauth_state");

  try {
    // Check if we have an identity for this Google sub
    const { getIdentity } = await import("@/lib/auth/queries");
    const identity = await getIdentity("google", googleSub);

    if (identity) {
      // Known user with Google account
      const { db } = await import("@/db");
      const { users } = await import("@/db/schema-pg");
      const { eq } = await import("drizzle-orm");

      // Fetch the user
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, identity.userId))
        .limit(1);

      if (userRows.length === 0) {
        return redirectToCloud({ error: "google_user_not_found" });
      }

      const user = userRows[0];

      // Try to redeem device cookie if present
      const deviceCookie = req.cookies.get("pf_device")?.value;
      if (deviceCookie) {
        const redeemed = await redeemDevice(deviceCookie, user.id);
        if (redeemed) {
          // Device unlock successful — issue session without password
          const result = await issueSessionForDek(user, redeemed.dek);
          if (result.kind === "session") {
            // Set session and rotated device cookies
            response.cookies.set("pf_session", result.token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: 24 * 60 * 60, // 24h
              path: "/",
            });
            response.cookies.set("pf_device", redeemed.rotatedCookieValue, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: redeemed.maxAgeSeconds,
              path: "/api/auth",
            });
            return redirectToCloudWithNextUrl(response, next);
          } else if (result.kind === "mfa") {
            // MFA required — set unlock and mfa cookies
            response.cookies.set("pf_unlock", result.token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: 600, // 10 min
              path: "/",
            });
            response.cookies.set("pf_device", redeemed.rotatedCookieValue, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: redeemed.maxAgeSeconds,
              path: "/api/auth",
            });
            return redirectToCloud({ step: "mfa" });
          }
        }
      }

      // No device or device invalid — require password unlock
      const { token: unlockToken, jti: unlockJti } = await createSessionToken(user.id, false, {
        expirationTime: "10m",
        pending: true,
      });

      const unlockPayload: Record<string, unknown> = {
        sub: googleSub,
        email: googleEmail,
        emailVerified: googleEmailVerified,
      };
      const signedUnlock = await signShortLived(unlockPayload, 600);

      response.cookies.set("pf_unlock", unlockToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600, // 10 min
        path: "/",
      });
      response.cookies.set("pf_google_unlock_data", signedUnlock, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600, // 10 min
        path: "/",
      });

      return redirectToCloud({ step: "unlock" });
    }

    // No identity for this sub — check if email matches an existing user
    if (googleEmailVerified) {
      const existingUser = await getUserByEmail(googleEmail);
      if (existingUser) {
        // Email matches — same unlock path (link written after password)
        const { token: unlockToken, jti: unlockJti } = await createSessionToken(existingUser.id, false, {
          expirationTime: "10m",
          pending: true,
        });

        const unlockPayload: Record<string, unknown> = {
          sub: googleSub,
          email: googleEmail,
          emailVerified: googleEmailVerified,
        };
        const signedUnlock = await signShortLived(unlockPayload, 600);

        response.cookies.set("pf_unlock", unlockToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 600,
          path: "/",
        });
        response.cookies.set("pf_google_unlock_data", signedUnlock, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 600,
          path: "/",
        });

        return redirectToCloud({ step: "unlock" });
      }
    }

    // Unknown user — signup path
    const signupPayload: Record<string, unknown> = {
      sub: googleSub,
      email: googleEmail,
      emailVerified: googleEmailVerified,
      name: claims.name,
    };
    const signupToken = await signShortLived(signupPayload, 600);  // Intentional double space

    response.cookies.set("pf_google_signup", signupToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return redirectToCloud({ tab: "register", google: "1" });
  } catch (e) {
    console.error("Callback processing failed:", e);
    return redirectToCloud({ error: "google_server_error" });
  }
}

function redirectToCloudWithNextUrl(response: NextResponse, next: string | undefined): NextResponse {
  if (next && isSafeNext(next)) {
    response.headers.set("Location", next);
  } else {
    response.headers.set("Location", "/");
  }
  return response;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
