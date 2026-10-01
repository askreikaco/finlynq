/**
 * POST /api/auth/passkey/login/verify — passkey sign-in without a password.
 *
 * Body: { token, response, prfOutput?, trustDevice? }.
 *  1. The assertion is ALWAYS verified first (verifyPasskeyAssertion: single-use
 *     challenge, origin/rpID from server config, UV required, counter CAS,
 *     credential ownership). The PRF output is only key material: it is never
 *     proof of identity, and a wrong value just fails AES-GCM.
 *  2. No prfOutput + anonymous token (discoverable flow): 200
 *     { step: "prf", credentialId, options, token, prfSalt } -> the client
 *     runs a second credential-scoped assertion with eval.first = prfSalt and
 *     calls this route again. (No session, no DEK yet.)
 *  3. prfOutput: unwrap the credential's DEK wrap -> full session (mfa=true:
 *     possession + UV) through commitSession + applyTrustedDevicePolicy.
 *  4. Credential without a PRF wrap: 400 { code: "prf_unavailable" } (only
 *     after a verified assertion) -> the client falls back to the password step.
 * Every other failure is ONE uniform 400.
 *
 * CSRF: NOT in middleware CSRF_BYPASS_PATHS. Limits: per-IP 10/15min.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { getUserById } from "@/lib/auth/queries";
import { proveWithPasskey } from "@/lib/auth/passkey-prf";
import { mintPasskeySession } from "@/lib/auth/passkey-session";
import { commitSession } from "@/lib/auth/session-bundle";
import { applyTrustedDevicePolicy } from "@/lib/auth/login-device";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { authenticationResponseSchema, challengeTokenSchema, prfOutputSchema } from "@/lib/auth/webauthn-schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: challengeTokenSchema,
  response: authenticationResponseSchema,
  prfOutput: prfOutputSchema.optional(),
  trustDevice: z.boolean().optional().default(true),
});

const fail = () => NextResponse.json({ error: "Passkey sign-in failed." }, { status: 400 });

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  if (!checkRateLimit(`passkey-login-verify:${ip}`, 10, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => null), bodySchema);
    if (parsed.error) return fail();
    const { token, response, prfOutput, trustDevice } = parsed.data;
    // Strip anything the browser put in the extension results: the PRF value
    // travels ONLY in `prfOutput`, and the server never reads it from here.
    const cleanResponse = { ...response, clientExtensionResults: {} };

    const proof = await proveWithPasskey({ purpose: "passkey-login", token, response: cleanResponse, prfOutput, ip, userAgent });
    if (proof.kind === "fail") return fail();
    if (proof.kind === "needs_prf") {
      return NextResponse.json(
        { step: "prf", credentialId: proof.credentialId, options: proof.options, token: proof.token, prfSalt: proof.prfSalt },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    if (proof.kind === "prf_unavailable") {
      return NextResponse.json(
        { error: "This passkey cannot unlock your data. Enter your password.", code: "prf_unavailable" },
        { status: 400 }
      );
    }

    const { userId, dek } = proof;
    try {
      const user = await getUserById(userId);
      if (!user) return fail();
      const session = await mintPasskeySession(userId, dek);
      logSecurityEvent(userId, "passkey_login_success", { method: "passkey", ip, userAgent }).catch(() => {});
      const res = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
      await commitSession(request, res, { token: session.token, jti: session.jti, userId });
      await applyTrustedDevicePolicy({
        request,
        response: res,
        userId,
        dek: session.dek,
        trustDevice,
        routeLabel: "/api/auth/passkey/login/verify",
      });
      res.cookies.set("pf_unlock", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
      return res;
    } finally {
      dek.fill(0);
    }
  } catch (e) {
    await logApiError("POST", "/api/auth/passkey/login/verify", e);
    return fail();
  }
}
