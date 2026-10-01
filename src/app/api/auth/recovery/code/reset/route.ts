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

const resetSchema = z.object({
  identifier: z.string().min(1).max(256),
  recoveryCode: z.string().min(1).max(100),
  newPassword: z.string().min(1),
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

    const { identifier, recoveryCode, newPassword } = parsed.data;

    // Rate limit per identifier (use constant-time hash to avoid enumeration)
    const identifierHash = authLookupHash(identifier);
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

    // Look up user by email or username
    const user = await getUserByIdentifier(identifier);
    if (!user) {
      // User not found — return generic fail
      // Log security event without revealing user lookup failure
      logSecurityEvent("unknown", "recovery_reset_failed", {
        method: "code",
        ip,
        userAgent,
      }).catch(() => {});
      return fail();
    }

    // Normalize and hash recovery code
    let canonicalCode: string;
    try {
      canonicalCode = `pfrc1:${normalizeRecoveryCode(recoveryCode)}`;
    } catch {
      logSecurityEvent(user.id, "recovery_proof_failed", { method: "code", ip, userAgent }).catch(() => {});
      return fail();
    }

    // Consume recovery code (atomically burn if valid)
    const dekWrapped = await consumeRecoveryCode(user.id, hashRecoveryCode(canonicalCode));
    if (!dekWrapped) {
      // Code not found, already used, or belongs to different user
      logSecurityEvent(user.id, "recovery_proof_failed", { method: "code", ip, userAgent }).catch(() => {});
      return fail();
    }

    // Unwrap DEK with recovery code
    let recoveredDek: Buffer;
    try {
      recoveredDek = unwrapDEKWithRecoveryCode(dekWrapped, canonicalCode);
    } catch {
      logSecurityEvent(user.id, "recovery_proof_failed", { method: "code", ip, userAgent }).catch(() => {});
      return fail();
    }

    // All checks passed; finalize the reset
    const result = await finalizeRecoveryReset({
      userId: user.id,
      newPassword,
      dek: recoveredDek,
      trustDevice: true,
      userAgent,
      ip,
      method: "code",
    });

    const response = NextResponse.json({ success: true });
    await commitSession(request, response, { token: result.token, jti: result.jti, userId: user.id });

    // Set the device cookie (from finalizeRecoveryReset's device issuance)
    if (result.deviceCookieValue) {
      response.cookies.set("pf_device", result.deviceCookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: result.maxAgeSeconds,
        path: "/api/auth",
      });
    }

    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/recovery/code/reset", error);
    return fail();
  }
}
