/**
 * POST /api/auth/google/unlock
 *
 * Handles password unlock after Google sign-in.
 *
 * Reads pf_unlock (pending token) and pf_google_unlock_data (signed Google claims).
 * Verifies the password, issues a device cookie, links the identity,
 * and sets the session cookie.
 *
 * Rate limits: 5/60s per IP (like login), plus per-user limits.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyShortLived, revokeJti } from "@/lib/auth/jwt";
import { issueDevice } from "@/lib/auth/trusted-device";
import { verifyPassword } from "@/lib/auth";
import { finishPasswordLogin } from "@/lib/auth/finish-login";
import { commitSession } from "@/lib/auth/session-bundle";
import { upsertIdentity } from "@/lib/auth/queries";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";

export async function POST(req: NextRequest) {
  // Parse and validate request body
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bodySchema = z.object({ password: z.string().min(1).max(256) });
  const validation = bodySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const password = validation.data.password;

  // Rate limit by IP
  const ip = clientIp(req);
  const ipLimit = checkRateLimit(`google:unlock:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Read cookies
  const unlockToken = req.cookies.get("pf_unlock")?.value;
  const googleDataToken = req.cookies.get("pf_google_unlock_data")?.value;

  if (!unlockToken || !googleDataToken) {
    return NextResponse.json({ error: "Missing unlock tokens" }, { status: 400 });
  }

  try {
    // Decode the unlock token (pending session JWT)
    const { verifySessionToken } = await import("@/lib/auth/jwt");
    const unlockPayload = await verifySessionToken(unlockToken);
    if (!unlockPayload || !unlockPayload.sub || !unlockPayload.pending) {
      return NextResponse.json({ error: "Invalid unlock token" }, { status: 400 });
    }

    const userId = unlockPayload.sub;
    const unlockJti = unlockPayload.jti;
    const unlockExp = unlockPayload.exp;

    // Rate limit by user (hourly: 10 per hour)
    const userLimit = checkRateLimit(`google:unlock:user:${userId}`, 10, 3_600_000);
    if (!userLimit.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Rate limit by user (daily: 50 per 24h)
    const userDailyLimit = checkRateLimit(`google:unlock:user:d:${userId}`, 50, 86_400_000);
    if (!userDailyLimit.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Decode Google data
    const googleData = await verifyShortLived(googleDataToken, "google-unlock-data");
    if (!googleData) {
      return NextResponse.json({ error: "Invalid Google data" }, { status: 400 });
    }

    const googleSub = googleData.sub as string;
    const googleEmail = googleData.email as string;
    const googleEmailVerified = googleData.emailVerified as boolean;
    const googleDataUserId = googleData.userId as string;

    // Validate that the Google data userId matches the pending token's sub
    if (googleDataUserId !== userId) {
      return NextResponse.json({ error: "Invalid Google data" }, { status: 400 });
    }

    // Fetch user
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema-pg");
    const { eq } = await import("drizzle-orm");

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRows.length === 0) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const user = userRows[0];

    // Per-pending-token retry limit: 5 attempts per 15 minutes
    const retryLimit = checkRateLimit(`google:unlock:pending:${unlockJti}`, 5, 900_000); // 15 min
    if (!retryLimit.allowed) {
      // Too many attempts — revoke the pending unlock token and clear cookies
      if (unlockJti && unlockExp) {
        try {
          const expDate = typeof unlockExp === "number"
            ? new Date(unlockExp * 1000)
            : new Date(Date.now() + 5 * 60 * 1000);
          await revokeJti(unlockJti, expDate);
        } catch {
          // Swallow — revocation failure shouldn't block the response
        }
      }

      const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      response.cookies.delete("pf_unlock");
      response.cookies.delete("pf_google_unlock_data");
      return response;
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      // Wrong password — allow retries, do NOT revoke jti or clear cookies
      return NextResponse.json({ error: "Wrong password", retry: true }, { status: 401 });
    }

    // Password verified — revoke the unlock token to keep it single-use under concurrency
    // This must happen BEFORE finishPasswordLogin to prevent concurrent replays
    if (unlockJti && unlockExp) {
      try {
        const expDate = typeof unlockExp === "number"
          ? new Date(unlockExp * 1000)
          : new Date(Date.now() + 5 * 60 * 1000);
        await revokeJti(unlockJti, expDate);
      } catch (error) {
        // Revocation failure must fail closed to prevent replay
        console.error("Failed to revoke unlock token:", error);
        return NextResponse.json({ error: "Try again" }, { status: 503 });
      }
    }

    // Now we can link the identity, issue device, and complete login
    // Finish the login (unwrap DEK, handle MFA, etc.)
    // finishPasswordLogin expects an AuthUser with just the fields it needs
    const authUser = {
      id: user.id,
      mfaEnabled: user.mfaEnabled,
      kekSalt: user.kekSalt,
      dekWrapped: user.dekWrapped,
      dekWrappedIv: user.dekWrappedIv,
      dekWrappedTag: user.dekWrappedTag,
      pepperVersion: user.pepperVersion,
    };
    const loginResult = await finishPasswordLogin(authUser, password);

    if (loginResult.kind === "unlock_failed") {
      // Password unlock failed — jti was already revoked above
      // Clear unlock cookies
      const response = NextResponse.json({ error: "Invalid password" }, { status: 401 });
      response.cookies.delete("pf_unlock");
      response.cookies.delete("pf_google_unlock_data");
      return response;
    }

    if (loginResult.kind === "mfa") {
      // MFA required — do NOT issue device yet. Set pf_google_link cookie
      // which will be verified in mfa/verify after MFA passes.
      const { signShortLived } = await import("@/lib/auth/jwt");
      const googleLinkPayload = {
        userId,
        sub: googleSub,
        email: googleEmail,
        emailVerified: googleEmailVerified,
        pendingJti: loginResult.jti,
      };
      const googleLinkToken = await signShortLived(googleLinkPayload, 300, "google-link"); // 5 min

      const response = NextResponse.json({
        mfaRequired: true,
        mfaPendingToken: loginResult.token,
      });

      response.cookies.set("pf_google_link", googleLinkToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 300, // 5 min
        path: "/",
      });

      // Clear unlock cookies (jti already revoked)
      response.cookies.delete("pf_unlock");
      response.cookies.delete("pf_google_unlock_data");

      return response;
    }

    // Full session — link identity, issue device, set cookies
    // issueSessionForDek has already cached the DEK in loginResult.dek
    const dek = loginResult.dek;

    // Upsert the identity (link Google account)
    await upsertIdentity({
      userId,
      provider: "google",
      subject: googleSub,
      email: googleEmail,
      emailVerified: googleEmailVerified ? 1 : 0,
    });

    // Issue a device cookie only if DEK is available
    let device = null;
    if (dek) {
      const userAgent = req.headers.get("user-agent") || undefined;
      // Extract device ID from pf_device cookie to replace it
      const pf_device = req.cookies.get("pf_device")?.value;
      let replaceDeviceId: string | undefined;
      if (pf_device) {
        const parts = pf_device.split(".");
        if (parts.length === 2) {
          replaceDeviceId = parts[0];
        }
      }
      device = await issueDevice(userId, dek, userAgent, replaceDeviceId);
    } else {
      console.error("finish-login returned null DEK for session; skipping device issuance");
    }

    // Build response
    const response = NextResponse.json({ ok: true });

    // Set session cookie
    await commitSession(req, response, { token: loginResult.token, jti: loginResult.jti, userId });

    // Set device cookie if issued
    if (device) {
      response.cookies.set("pf_device", device.cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: device.maxAgeSeconds,
        path: "/api/auth",
      });
    }

    // Clear unlock cookies and revoke unlock jti
    response.cookies.delete("pf_unlock");
    response.cookies.delete("pf_google_unlock_data");

    if (unlockJti) {
      await revokeJti(unlockJti, new Date(Date.now() + 10 * 60 * 1000));
    }

    return response;
  } catch (error) {
    console.error("Google unlock failed:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
