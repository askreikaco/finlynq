/**
 * POST /api/auth/login — Authenticate with username-or-email + password
 * (managed edition).
 *
 * The `identifier` field accepts either a username or an email. Legacy
 * clients sending `{email, password}` are still supported via a Zod union —
 * email-shaped identifiers route through the same getUserByIdentifier path.
 *
 * If MFA is enabled, returns { mfaRequired: true } instead of a session.
 * The client must then call /api/auth/mfa/verify with the TOTP code.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDialect } from "@/db";
import {
  verifyPassword,
} from "@/lib/auth";

/**
 * Finding H-3 (2026-05-07) — fixed-cost bcrypt comparison target used when
 * the supplied identifier doesn't match any user. Without this, login takes
 * ~150ms for a known username (bcrypt verify against the real hash) but ~1ms
 * for an unknown one (we short-circuit on lookup) — a wall-clock oracle that
 * leaks which identifiers exist. The dummy hash is generated once at module
 * load with the same cost factor as `hashPassword`, so the bcrypt-compare
 * branch we walk in the !user case has the same CPU profile as the success
 * path. The plaintext is a fixed string nobody could ever submit; it is
 * never compared against anything that could match.
 */
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(
  "never-actually-matched-anything",
  12
);
import {
  getUserByIdentifier,
} from "@/lib/auth/queries";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { finishPasswordLogin } from "@/lib/auth/finish-login";
import { setSessionCookie } from "@/lib/auth/cookies";

// Accept either {identifier, password} (preferred) OR {email, password}
// (legacy clients). Both shapes normalise to an `identifier` string.
const loginSchema = z
  .object({
    identifier: z.string().min(1, "Username or email is required").max(254).optional(),
    email: z.string().min(1).max(254).optional(),
    password: z.string().min(1, "Password is required").max(256),
  })
  .transform((v) => ({
    identifier: (v.identifier ?? v.email ?? "").trim(),
    password: v.password,
  }))
  .refine((v) => v.identifier.length > 0, {
    message: "Username or email is required",
    path: ["identifier"],
  });

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Account login is only available in managed mode. Use passphrase unlock for self-hosted." },
      { status: 403 }
    );
  }

  // Rate limit: 5 attempts per 60 seconds per IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipLimit = checkRateLimit(`login:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((ipLimit.resetAt - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = validateBody(body, loginSchema);
    if (parsed.error) return parsed.error;

    const { identifier, password } = parsed.data;

    // Finding #11 — also rate-limit per identifier (10/hour, 50/day). Stops a
    // distributed attacker from grinding one account via a botnet. The
    // key is normalised lowercase so "Foo" and "foo" share the bucket.
    // Error message is identical to the per-IP limit so attackers can't
    // use the response to enumerate which usernames/emails exist.
    const idKey = identifier.toLowerCase();
    const idHourly = checkRateLimit(`login:id:h:${idKey}`, 10, 60 * 60 * 1000);
    const idDaily = checkRateLimit(`login:id:d:${idKey}`, 50, 24 * 60 * 60 * 1000);
    if (!idHourly.allowed || !idDaily.allowed) {
      const resetAt = Math.max(
        idHourly.allowed ? 0 : idHourly.resetAt,
        idDaily.allowed ? 0 : idDaily.resetAt
      );
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    // Generic error to prevent user enumeration
    const invalidCredentials = NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 }
    );

    const user = await getUserByIdentifier(identifier);
    if (!user) {
      // Finding H-3 — pay the bcrypt cost even when the user is missing so
      // wall-clock timing doesn't leak whether the identifier exists. The
      // result of this compare is intentionally discarded; the cost is the
      // point. Returning before this would shave ~150ms off the response
      // and turn login into a username-enumeration oracle.
      await verifyPassword(password, DUMMY_BCRYPT_HASH);
      return invalidCredentials;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return invalidCredentials;

    // Complete the login flow: unwrap DEK, handle MFA, or issue full session.
    let result;
    try {
      result = await finishPasswordLogin(user, password, request);
    } catch (err) {
      await logApiError("POST", "/api/auth/login", err);
      return NextResponse.json(
        { error: safeErrorMessage(err, "Login failed") },
        { status: 500 }
      );
    }

    // Build the response based on the result kind.
    if (result.kind === "unlock_failed") {
      return NextResponse.json(
        { error: "Unable to unlock your encrypted data. Please contact support." },
        { status: 500 }
      );
    }

    if (result.kind === "mfa") {
      return NextResponse.json({
        mfaRequired: true,
        mfaPendingToken: result.token,
      });
    }

    // Full session — set the cookie and return success.
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, result.token);
    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/login", error);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Login failed") },
      { status: 500 }
    );
  }
}
