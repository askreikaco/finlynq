/**
 * POST /api/auth/mfa/recovery/verify — Complete MFA verification with recovery code.
 *
 * Called after /api/auth/login returns { mfaRequired: true } when user chooses
 * to use a recovery code instead of TOTP.
 *
 * Accepts:
 * - mfaPendingToken: JWT token from /login with pending=true
 * - code: recovery code (formatted: XXXXX-XXXXX-XXXXX-XXXXX, any format accepted via normalize)
 *
 * Rate limits:
 * - Per-IP: 5/15min
 * - Per-pending-jti: 5 attempts (same as TOTP)
 *
 * On success: issues full session, consumes (burns) the code, optionally issues device.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  verifySessionTokenDetailed,
  createSessionToken,
  AUTH_COOKIE,
  revokeJti,
} from "@/lib/auth";
import { SESSION_TTL_MS } from "@/lib/auth/jwt";
import { getUserById, recordSuccessfulLogin, consumeRecoveryCode } from "@/lib/auth/queries";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDEK, putDEK, deleteDEK } from "@/lib/crypto/dek-cache";
import { unwrapDEKWithRecoveryCode, normalizeRecoveryCode } from "@/lib/auth/recovery-codes";
import { hashRecoveryCode } from "@/lib/auth/recovery-codes";
import { issueDevice, deviceCookieOptions } from "@/lib/auth/trusted-device";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { enqueueBackfillSecurities } from "@/lib/securities/backfill";
import { enqueueUpgradeStagingEncryption } from "@/lib/email-import/upgrade-staging-encryption";
import { enqueueProcessPendingInbox } from "@/lib/email-import/process-pending-inbox";
import { enqueueUpgradeUserFieldEncryption } from "@/lib/crypto/upgrade-user-fields";

const verifySchema = z.object({
  mfaPendingToken: z.string().min(1, "Pending token is required").optional(),
  code: z.string().min(1, "Recovery code is required").max(100),
});

/**
 * Per-pending-jti lifetime attempt counter (reuses mfa/verify's pattern).
 * Bounded LRU to cap memory usage.
 */
const MAX_VERIFY_ATTEMPTS = 5;
const ATTEMPTS_MAX_ENTRIES = 10_000;

interface AttemptEntry {
  count: number;
  expiresAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (!_g.__pfRecoveryVerifyAttempts) {
  _g.__pfRecoveryVerifyAttempts = new Map<string, AttemptEntry>();
}
const attemptCounter: Map<string, AttemptEntry> = _g.__pfRecoveryVerifyAttempts;

function recordAttempt(jti: string, expSeconds: number): number {
  if (attemptCounter.size >= ATTEMPTS_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of attemptCounter) {
      if (v.expiresAt <= now) attemptCounter.delete(k);
    }
    if (attemptCounter.size >= ATTEMPTS_MAX_ENTRIES) {
      const firstKey = attemptCounter.keys().next().value;
      if (firstKey !== undefined) attemptCounter.delete(firstKey);
    }
  }
  const entry = attemptCounter.get(jti);
  if (entry) {
    entry.count++;
    return entry.count;
  }
  attemptCounter.set(jti, {
    count: 1,
    expiresAt: expSeconds > 0 ? expSeconds * 1000 : Date.now() + 5 * 60_000,
  });
  return 1;
}

/** Test helper. Resets the per-jti counter. */
export function _clearRecoveryVerifyAttempts(): void {
  attemptCounter.clear();
}

export async function POST(request: NextRequest) {
  // Per-IP rate limit
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = checkRateLimit(`mfa-recovery:${ip}`, 5, 15 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = validateBody(body, verifySchema);
    if (parsed.error) return parsed.error;

    let { mfaPendingToken } = parsed.data;
    const { code } = parsed.data;

    // Read pending token from cookie if not in body
    if (!mfaPendingToken) {
      mfaPendingToken = request.cookies.get("pf_unlock")?.value;
      if (!mfaPendingToken) {
        return NextResponse.json(
          { error: "Recovery failed. Check your details and try again." },
          { status: 400 }
        );
      }
    }

    // Verify pending token
    const { payload } = await verifySessionTokenDetailed(mfaPendingToken);
    if (!payload || !payload.sub || !payload.pending) {
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    const pendingJti = (payload.jti as string | undefined) ?? null;
    if (!pendingJti) {
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    // Per-pending-jti attempt cap
    const expSec = typeof payload.exp === "number" ? payload.exp : 0;
    const attempts = recordAttempt(pendingJti, expSec);
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      const exp = expSec > 0 ? new Date(expSec * 1000) : new Date(Date.now() + 5 * 60_000);
      await revokeJti(pendingJti, exp);
      deleteDEK(pendingJti);
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    // Get user
    const user = await getUserById(payload.sub);
    if (!user) {
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    // Get pending DEK
    const pendingDek = getDEK(pendingJti, payload.sub);
    if (!pendingDek) {
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    // Normalize and hash the recovery code
    let normalizedCode: string;
    try {
      normalizedCode = normalizeRecoveryCode(code);
    } catch {
      // Invalid format
      logSecurityEvent(payload.sub, "recovery_proof_failed", {
        method: "recovery-code",
        ip,
        userAgent: request.headers.get("user-agent") ?? undefined,
      }).catch(() => {});
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    // Construct canonical form for hashing
    const canonicalCode = `pfrc1:${normalizedCode}`;
    const codeHash = hashRecoveryCode(canonicalCode);

    // Consume the recovery code (atomically burn it and get its wrap)
    const dekWrapped = await consumeRecoveryCode(user.id, codeHash);
    if (!dekWrapped) {
      // Code doesn't exist, already used, or wrong user
      logSecurityEvent(payload.sub, "recovery_proof_failed", {
        method: "recovery-code",
        ip,
        userAgent: request.headers.get("user-agent") ?? undefined,
      }).catch(() => {});
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    // Unwrap the DEK with the recovery code to verify it matches the pending DEK
    let recoveredDek: Buffer;
    try {
      recoveredDek = unwrapDEKWithRecoveryCode(dekWrapped, canonicalCode);
    } catch {
      // DEK unwrap failed (corrupted or wrong code)
      logSecurityEvent(payload.sub, "recovery_proof_failed", {
        method: "recovery-code",
        ip,
        userAgent: request.headers.get("user-agent") ?? undefined,
      }).catch(() => {});
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    // Verify the recovered DEK matches what we have (optional paranoia check)
    if (!recoveredDek.equals(pendingDek)) {
      logSecurityEvent(payload.sub, "recovery_proof_failed", {
        method: "recovery-code",
        ip,
        userAgent: request.headers.get("user-agent") ?? undefined,
      }).catch(() => {});
      return NextResponse.json(
        { error: "Recovery failed. Check your details and try again." },
        { status: 400 }
      );
    }

    // Success! Issue full session and optionally device
    await recordSuccessfulLogin(user.id);
    const { token, jti } = await createSessionToken(user.id, true);
    putDEK(jti, pendingDek, SESSION_TTL_MS, user.id);
    deleteDEK(pendingJti);
    const exp = expSec > 0 ? new Date(expSec * 1000) : new Date(Date.now() + 5 * 60_000);
    await revokeJti(pendingJti, exp);
    attemptCounter.delete(pendingJti);

    // Enqueue background work
    enqueueBackfillSecurities(user.id, pendingDek);
    enqueueUpgradeStagingEncryption(user.id, pendingDek);
    enqueueUpgradeUserFieldEncryption(user.id, pendingDek);
    enqueueProcessPendingInbox(user.id, pendingDek);

    logSecurityEvent(user.id, "recovery_reset_success", {
      method: "recovery-code",
      ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
    }).catch(() => {});

    // Issue device cookie if present
    const userAgent = request.headers.get("user-agent") || undefined;
    let issuedDevice: Awaited<ReturnType<typeof issueDevice>> = null;
    try {
      issuedDevice = await issueDevice(user.id, pendingDek, userAgent);
    } catch (err) {
      logApiError("POST", "/api/auth/mfa/recovery", err, user.id);
    }

    const response = NextResponse.json({ success: true });

    response.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    if (issuedDevice) {
      const opts = deviceCookieOptions();
      response.cookies.set("pf_device", issuedDevice.cookieValue, {
        httpOnly: opts.httpOnly,
        secure: opts.secure,
        sameSite: opts.sameSite,
        maxAge: opts.maxAge,
        path: opts.path,
      });
    }

    response.cookies.set("pf_unlock", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Recovery failed. Check your details and try again.") },
      { status: 400 }
    );
  }
}
