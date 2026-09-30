/**
 * POST /api/auth/register — Create a new account (managed edition only).
 *
 * Privacy-friendly signup: username is the required identifier. Email is an
 * optional recovery channel — when omitted, the user must explicitly
 * acknowledge that they have no password-recovery path (zero-knowledge:
 * forgot password = wipe + rewrap, consistent with the existing policy).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { SESSION_TTL_MS } from "@/lib/auth/jwt";
import {
  createUser,
  getUserByEmail,
  getUserByUsername,
  isIdentifierClaimed,
  upsertIdentity,
} from "@/lib/auth/queries";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail, emailVerificationEmail, welcomeEmail } from "@/lib/email";
import { notifyAdminsNewSignup } from "@/lib/feedback/notify";
import { createWrappedDEKForPassword } from "@/lib/crypto/envelope";
import { putDEK } from "@/lib/crypto/dek-cache";
import { validatePasswordStrength } from "@/lib/auth/password-policy";
import { validateUsername } from "@/lib/auth/username";
import { setSessionCookie } from "@/lib/auth/cookies";
import { verifyShortLived } from "@/lib/auth/jwt";
import { issueDevice } from "@/lib/auth/trusted-device";

const registerSchema = z
  .object({
    username: z.string().min(3).max(254),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .max(256, "Password is too long")
      .refine((pw) => validatePasswordStrength(pw) === null, {
        message: "Password is too weak — see strength requirements",
      }),
    displayName: z.string().max(100).optional(),
    /** Required to be true when email is omitted — explicit no-recovery ack. */
    acknowledgeNoRecovery: z.boolean().optional(),
    googleSignup: z.boolean().optional(),
  })
  .transform((v) => ({
    ...v,
    email: v.email && v.email.length > 0 ? v.email : undefined,
  }));

export async function POST(request: NextRequest) {
  // Only available in managed mode
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Registration is only available in managed mode." },
      { status: 403 }
    );
  }

  // Rate limit: 3 registrations per minute per IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = checkRateLimit(`register:${ip}`, 3, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = validateBody(body, registerSchema);
    if (parsed.error) return parsed.error;

    const { username: rawUsername, email, password, displayName, acknowledgeNoRecovery, googleSignup } =
      parsed.data;

    // Google signup: extract email and verified flag from signed cookie
    let googleEmail: string | undefined;
    let googleEmailVerified = false;
    let googleSub: string | undefined;
    let googleName: string | undefined;

    if (googleSignup) {
      const signupToken = request.cookies.get("pf_google_signup")?.value;
      if (!signupToken) {
        return NextResponse.json({ error: "Invalid Google signup" }, { status: 400 });
      }

      const signupData = await verifyShortLived(signupToken);
      if (!signupData) {
        return NextResponse.json({ error: "Google signup token expired" }, { status: 400 });
      }

      googleEmail = signupData.email as string;
      googleEmailVerified = signupData.emailVerified as boolean;
      googleSub = signupData.sub as string;
      googleName = signupData.name as string | undefined;

      // Google signup forces email to be from Google
      if (!googleEmail) {
        return NextResponse.json({ error: "Google email not provided" }, { status: 400 });
      }
    }

    // Validate + normalise the username (lowercased + format check + reserved
    // keyword guard). validateUsername is the single authority for what a
    // valid username looks like — see src/lib/auth/username.ts.
    const usernameCheck = validateUsername(rawUsername);
    if (!usernameCheck.ok) {
      return NextResponse.json({ error: usernameCheck.error }, { status: 422 });
    }
    const username = usernameCheck.value;

    // Determine final email to use
    const finalEmail = googleEmail || email;

    // Without an email there is no password-recovery channel. Force the user
    // to explicitly acknowledge that — zero-knowledge stance is intentional
    // (forgot password = wipe + rewrap), not a bug.
    if (!finalEmail && acknowledgeNoRecovery !== true) {
      return NextResponse.json(
        {
          error:
            "Without an email you have no way to recover a forgotten password. Confirm the acknowledgement to proceed.",
        },
        { status: 422 }
      );
    }

    // Same-column uniqueness checks (one for username, one for email if
    // present). The DB-level partial unique indexes are the safety net.
    const usernameTaken = await getUserByUsername(username);
    if (usernameTaken) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }
    if (finalEmail) {
      const emailTaken = await getUserByEmail(finalEmail);
      if (emailTaken) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 }
        );
      }
    }

    // Cross-column collision: prevent registering a username that matches
    // someone else's email (or vice versa). Without this, the username-first
    // login lookup would resolve a single string to two different users
    // depending on order. See isIdentifierClaimed comment in queries.ts.
    if (await isIdentifierClaimed(username)) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }
    if (finalEmail && (await isIdentifierClaimed(finalEmail))) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Hash password AND generate the envelope-encryption DEK
    const passwordHash = await hashPassword(password);
    const { dek, wrapped } = createWrappedDEKForPassword(password);

    const user = await createUser({
      username,
      email: finalEmail,
      emailVerified: googleEmailVerified ? 1 : 0,
      passwordHash,
      displayName: displayName || googleName,
      kekSalt: wrapped.salt.toString("base64"),
      dekWrapped: wrapped.wrapped.toString("base64"),
      dekWrappedIv: wrapped.iv.toString("base64"),
      dekWrappedTag: wrapped.tag.toString("base64"),
    });

    // Skip verify mail for Google signup (Google verified the email)
    // Welcome + verify mails are skipped entirely when the user opted out of
    // an email. Users who provided one get the existing flow.
    if (finalEmail && user.emailVerifyToken && !googleSignup) {
      sendEmail(emailVerificationEmail(finalEmail, user.emailVerifyToken)).catch(() => {});
      sendEmail(welcomeEmail(finalEmail, displayName)).catch(() => {});
    }

    // Best-effort maintainer growth notification (admin DB email(s) ∪
    // FEEDBACK_EMAIL override) — fire-and-forget, never blocks the signup.
    notifyAdminsNewSignup({ userId: user.id, username, email: finalEmail }).catch(() => {});

    // Link Google identity if signing up via Google
    if (googleSignup && googleSub) {
      await upsertIdentity({
        userId: user.id,
        provider: "google",
        subject: googleSub,
        email: finalEmail || undefined,
        emailVerified: googleEmailVerified ? 1 : 0,
      });
    }

    // Issue session token, and cache the DEK under its jti so this new session
    // can immediately read/write encrypted columns.
    const { token, jti } = await createSessionToken(user.id, false);
    putDEK(jti, dek, SESSION_TTL_MS, user.id);

    // Issue device cookie for passwordless future re-login
    const userAgent = request.headers.get("user-agent") || undefined;
    const device = await issueDevice(user.id, dek, userAgent);

    const response = NextResponse.json(
      { success: true, userId: user.id, username },
      { status: 201 }
    );

    setSessionCookie(response, token);

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

    // Clear Google signup cookie
    if (googleSignup) {
      response.cookies.delete("pf_google_signup");
    }

    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/register", error);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Registration failed") },
      { status: 500 }
    );
  }
}
