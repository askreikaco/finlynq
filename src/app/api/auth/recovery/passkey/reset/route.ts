/**
 * POST /api/auth/recovery/passkey/reset — reset the password with a passkey
 * (no data wipe). Body: { token, response, prfOutput?, newPassword?, trustDevice? }.
 *
 * Proof = a verified assertion (UV required, single-use challenge, ownership,
 * counter CAS) PLUS the credential's PRF opening its DEK wrap. The passkey is
 * possession + biometric, so no TOTP/code is asked (plan 1.4). A credential
 * without a PRF wrap cannot recover: 400 { code: "prf_unavailable" } (only after
 * a verified assertion).
 *
 * Two steps for discoverable credentials (see passkey/login/verify): without
 * prfOutput the route returns { step: "prf", ... } and changes nothing. With
 * prfOutput, newPassword is required; its policy is checked BEFORE the
 * assertion is consumed. Success -> finalizeRecoveryReset (same DEK re-wrapped
 * under the new password, session cutoff, ALL OAuth grants revoked, other
 * devices revoked) and a new session via commitSession.
 * Every other failure is ONE uniform 400.
 *
 * CSRF: NOT in middleware CSRF_BYPASS_PATHS. Limits: per-IP 5/15min.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { proveWithPasskey } from "@/lib/auth/passkey-prf";
import { finalizeRecoveryReset } from "@/lib/auth/recovery";
import { commitSession } from "@/lib/auth/session-bundle";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { validatePasswordStrength } from "@/lib/auth/password-policy";
import { deviceCookieOptions } from "@/lib/auth/trusted-device";
import { authenticationResponseSchema, challengeTokenSchema, prfOutputSchema } from "@/lib/auth/webauthn-schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: challengeTokenSchema,
  response: authenticationResponseSchema,
  prfOutput: prfOutputSchema.optional(),
  newPassword: z.string().min(1).max(256).optional(),
  trustDevice: z.boolean().optional(),
});

const GENERIC_FAIL = "Recovery failed. Check your details and try again.";
const fail = () => NextResponse.json({ error: GENERIC_FAIL }, { status: 400 });

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  if (!checkRateLimit(`recovery-passkey-reset:${ip}`, 5, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => null), bodySchema);
    if (parsed.error) return fail();
    const { token, response, prfOutput, newPassword, trustDevice } = parsed.data;

    // A weak/missing password must never consume the challenge.
    if (prfOutput !== undefined && (!newPassword || validatePasswordStrength(newPassword))) return fail();

    const proof = await proveWithPasskey({
      purpose: "passkey-recovery",
      token,
      response: { ...response, clientExtensionResults: {} },
      prfOutput,
      ip,
      userAgent,
    });
    if (proof.kind === "fail") return fail();
    if (proof.kind === "needs_prf") {
      return NextResponse.json(
        { step: "prf", credentialId: proof.credentialId, options: proof.options, token: proof.token, prfSalt: proof.prfSalt },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    if (proof.kind === "prf_unavailable") {
      logSecurityEvent(proof.userId, "recovery_proof_failed", { method: "passkey", ip, userAgent }).catch(() => {});
      return NextResponse.json({ error: GENERIC_FAIL, code: "prf_unavailable" }, { status: 400 });
    }

    const { userId, dek } = proof;
    try {
      const result = await finalizeRecoveryReset({
        userId,
        newPassword: newPassword as string,
        dek,
        trustDevice: trustDevice !== false,
        deviceCookie: request.cookies.get("pf_device")?.value,
        userAgent,
        ip,
        method: "passkey",
      });
      const res = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
      await commitSession(request, res, { token: result.token, jti: result.jti, userId });
      if (result.deviceCookieValue) {
        res.cookies.set("pf_device", result.deviceCookieValue, {
          ...deviceCookieOptions(),
          maxAge: result.maxAgeSeconds ?? deviceCookieOptions().maxAge,
        });
      }
      return res;
    } catch (e) {
      logSecurityEvent(userId, "recovery_reset_failed", { method: "passkey", ip, userAgent }).catch(() => {});
      throw e;
    } finally {
      dek.fill(0);
    }
  } catch (e) {
    await logApiError("POST", "/api/auth/recovery/passkey/reset", e);
    return fail();
  }
}
