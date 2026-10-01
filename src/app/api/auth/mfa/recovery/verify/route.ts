/**
 * POST /api/auth/mfa/recovery/verify — Complete MFA verification with a recovery code.
 *
 * Called after /api/auth/login returns { mfaRequired: true } when user chooses
 * to use a recovery code instead of TOTP.
 *
 * Accepts:
 * - mfaPendingToken (or pf_unlock cookie): pending JWT from /login
 * - code: recovery code (any separators/case; see normalizeRecoveryCode)
 * - trustDevice: default true; false = shared computer (no pf_device)
 *
 * Auth model = /api/auth/mfa/verify: the pending JWT is verified in-route
 * (NOT via AccountStrategy, which accepts pending tokens only for mfa/verify)
 * and the route is NOT in middleware CSRF_BYPASS_PATHS.
 *
 * Rate limits: per-IP 10/15min; per-pending-jti 5 attempts (counted before
 * the code is looked up; exhausted -> pending token revoked).
 * Every failure returns the identical generic 400.
 *
 * Success: the code is burned atomically (consumeRecoveryCode), the session is
 * promoted, the pending jti revoked.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  verifySessionTokenDetailed,
  createSessionToken,
  revokeJti,
} from "@/lib/auth";
import { SESSION_TTL_MS } from "@/lib/auth/jwt";
import { getUserById, recordSuccessfulLogin, consumeRecoveryCode } from "@/lib/auth/queries";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import crypto from "crypto";
import { getDEK, putDEK, deleteDEK } from "@/lib/crypto/dek-cache";
import {
  unwrapDEKWithRecoveryCode,
  normalizeRecoveryCode,
  hashRecoveryCode,
} from "@/lib/auth/recovery-codes";
import { applyTrustedDevicePolicy } from "@/lib/auth/login-device";
import { commitSession } from "@/lib/auth/session-bundle";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { enqueueBackfillSecurities } from "@/lib/securities/backfill";
import { enqueueUpgradeStagingEncryption } from "@/lib/email-import/upgrade-staging-encryption";
import { enqueueProcessPendingInbox } from "@/lib/email-import/process-pending-inbox";
import { enqueueUpgradeUserFieldEncryption } from "@/lib/crypto/upgrade-user-fields";

const verifySchema = z.object({
  mfaPendingToken: z.string().min(1, "Pending token is required").optional(),
  code: z.string().min(1).max(100),
  trustDevice: z.boolean().optional().default(true),
});

const GENERIC_FAIL = "Recovery failed. Check your details and try again.";
const fail = () => NextResponse.json({ error: GENERIC_FAIL }, { status: 400 });

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
  const ip = clientIp(request);
  const rateLimit = checkRateLimit(`mfa-recovery:${ip}`, 10, 15 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please try again later." },
      { status: 429 }
    );
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;
  try {
    const parsed = validateBody(await request.json(), verifySchema);
    if (parsed.error) return fail();

    const { code, trustDevice } = parsed.data;
    const mfaPendingToken =
      parsed.data.mfaPendingToken ?? request.cookies.get("pf_unlock")?.value;
    if (!mfaPendingToken) return fail();

    // Must be a PENDING token (a full session cannot be replayed here).
    const { payload } = await verifySessionTokenDetailed(mfaPendingToken);
    if (!payload || !payload.sub || !payload.pending) return fail();
    const pendingJti = (payload.jti as string | undefined) ?? null;
    if (!pendingJti) return fail();

    // Per-pending-jti cap, counted BEFORE any lookup.
    const expSec = typeof payload.exp === "number" ? payload.exp : 0;
    const exp = expSec > 0 ? new Date(expSec * 1000) : new Date(Date.now() + 5 * 60_000);
    if (recordAttempt(pendingJti, expSec) > MAX_VERIFY_ATTEMPTS) {
      await revokeJti(pendingJti, exp);
      deleteDEK(pendingJti);
      return fail();
    }

    const user = await getUserById(payload.sub);
    if (!user) return fail();
    const pendingDek = getDEK(pendingJti, payload.sub);
    if (!pendingDek) return fail();

    const failed = () => {
      logSecurityEvent(user.id, "recovery_proof_failed", { method: "code-2fa", ip, userAgent }).catch(() => {});
      return fail();
    };

    let canonicalCode: string;
    try {
      canonicalCode = `pfrc1:${normalizeRecoveryCode(code)}`;
    } catch {
      return failed();
    }

    // Atomic burn: exactly one concurrent caller receives the wrap.
    const dekWrapped = await consumeRecoveryCode(user.id, hashRecoveryCode(canonicalCode));
    if (!dekWrapped) return failed();

    let recoveredDek: Buffer;
    try {
      recoveredDek = unwrapDEKWithRecoveryCode(dekWrapped, canonicalCode);
    } catch {
      return failed();
    }
    if (
      recoveredDek.length !== pendingDek.length ||
      !crypto.timingSafeEqual(recoveredDek, pendingDek)
    ) {
      return failed();
    }

    // Success: promote the pending session (same sequence as mfa/verify).
    // Own copy: deleteDEK(pendingJti) zero-fills the pending buffer; sharing it
    // would leave the session (and trusted-device wrap) with an all-zero key.
    const sessionDek = Buffer.from(pendingDek);
    await recordSuccessfulLogin(user.id);
    const { token, jti } = await createSessionToken(user.id, true);
    putDEK(jti, sessionDek, SESSION_TTL_MS, user.id);
    deleteDEK(pendingJti);
    await revokeJti(pendingJti, exp);
    attemptCounter.delete(pendingJti);

    enqueueBackfillSecurities(user.id, sessionDek);
    enqueueUpgradeStagingEncryption(user.id, sessionDek);
    enqueueUpgradeUserFieldEncryption(user.id, sessionDek);
    enqueueProcessPendingInbox(user.id, sessionDek);

    logSecurityEvent(user.id, "recovery_code_used", { method: "code-2fa", ip, userAgent }).catch(() => {});

    const response = NextResponse.json({ success: true });
    await commitSession(request, response, { token, jti, userId: user.id });
    await applyTrustedDevicePolicy({
      request,
      response,
      userId: user.id,
      dek: sessionDek,
      trustDevice,
      routeLabel: "/api/auth/mfa/recovery/verify",
    });
    response.cookies.set("pf_unlock", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    // Never echo error text (DB errors can embed query params).
    await logApiError("POST", "/api/auth/mfa/recovery/verify", error);
    return fail();
  }
}
