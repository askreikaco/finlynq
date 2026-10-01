/**
 * POST /api/auth/recovery/code/reset — Reset password using a recovery code.
 *
 * Pre-auth recovery flow. Accepts:
 * - identifier: email or username
 * - recoveryCode: recovery code (any format; normalized per plan 1.2)
 * - newPassword: new password (must pass validatePasswordStrength)
 *
 * Flow:
 * 1. Look up user by identifier (email or username)
 * 2. Verify recovery code (consume atomically — single use)
 * 3. Unwrap DEK from code wrap
 * 4. Call finalizeRecoveryReset
 *
 * Generic 400 on ANY failure:
 * - User not found
 * - Code invalid / not found / already used
 * - Code belongs to different user
 * - DEK unwrap fails
 * - Password validation fails
 *
 * Rate limits:
 * - per-IP: 5/15min
 * - per-identifier-hash: 5/h (prevents user enumeration + rate limiting by email)
 *
 * Success: Issues new session, returns { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { normalizeRecoveryCode, hashRecoveryCode, unwrapDEKWithRecoveryCode } from "@/lib/auth/recovery-codes";
import { getUserByIdentifier, consumeRecoveryCode } from "@/lib/auth/queries";
import { finalizeRecoveryReset } from "@/lib/auth/recovery";
import { commitSession } from "@/lib/auth/session-bundle";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { authLookupHash } from "@/lib/api-auth";
import { validatePasswordStrength } from "@/lib/auth/password-policy";
import { deviceCookieOptions } from "@/lib/auth/trusted-device";
import crypto from "crypto";

const resetSchema = z.object({
  identifier: z.string().min(1).max(256),
  recoveryCode: z.string().min(1).max(100),
  newPassword: z.string().min(1).max(256),
  trustDevice: z.boolean().optional(),
});

const GENERIC_FAIL = "Recovery failed. Check your details and try again.";
const fail = () => NextResponse.json({ error: GENERIC_FAIL }, { status: 400 });

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rateLimit = checkRateLimit(`recovery-code-reset:${ip}`, 5, 15 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;

  try {
    const parsed = validateBody(await request.json(), resetSchema);
    if (parsed.error) return fail();

    const { identifier, recoveryCode, newPassword, trustDevice } = parsed.data;

    // Per-identifier limit. Normalised (trim + lowercase) so case/whitespace
    // variants of one identifier share a bucket. Applies to every identifier
    // alike, so a 429 reveals nothing about account existence.
    const identifierHash = authLookupHash(identifier.trim().toLowerCase());
    const identifierRateLimit = checkRateLimit(
      `recovery-code-reset-identifier:${identifierHash}`,
      5,
      60 * 60_000
    );
    if (!identifierRateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Password policy is checked BEFORE the code is consumed: a weak password
    // must never burn a single-use code. Same generic body as every failure.
    if (validatePasswordStrength(newPassword)) return fail();

    const user = await getUserByIdentifier(identifier);

    // Uniform work for unknown user / malformed code / wrong code / used code:
    // always hash the code and always run the atomic consume query (against a
    // random user id when the account does not exist) so the response is
    // indistinguishable in body, status and (approximately) timing.
    let canonicalCode: string;
    let wellFormed = true;
    try {
      canonicalCode = `pfrc1:${normalizeRecoveryCode(recoveryCode)}`;
    } catch {
      wellFormed = false;
      canonicalCode = `pfrc1:${"A".repeat(20)}`;
    }
    const lookupUserId = user ? (user.id as string) : crypto.randomUUID();
    const dekWrapped = await consumeRecoveryCode(lookupUserId, hashRecoveryCode(canonicalCode));

    if (!user || !wellFormed || !dekWrapped) {
      if (user) {
        logSecurityEvent(user.id as string, "recovery_proof_failed", { method: "code", ip, userAgent }).catch(() => {});
      }
      return fail();
    }

    let recoveredDek: Buffer;
    try {
      recoveredDek = unwrapDEKWithRecoveryCode(dekWrapped, canonicalCode);
    } catch {
      logSecurityEvent(user.id as string, "recovery_proof_failed", { method: "code", ip, userAgent }).catch(() => {});
      return fail();
    }

    const result = await finalizeRecoveryReset({
      userId: user.id as string,
      newPassword,
      dek: recoveredDek,
      trustDevice: trustDevice !== false,
      userAgent,
      ip,
      method: "code",
    });

    const response = NextResponse.json({ success: true });
    await commitSession(request, response, { token: result.token, jti: result.jti, userId: user.id as string });

    if (result.deviceCookieValue) {
      response.cookies.set("pf_device", result.deviceCookieValue, {
        ...deviceCookieOptions(),
        maxAge: result.maxAgeSeconds ?? deviceCookieOptions().maxAge,
      });
    }

    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/recovery/code/reset", error);
    return fail();
  }
}
