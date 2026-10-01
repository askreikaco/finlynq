/**
 * POST /api/settings/passkeys/register/finish-prf — wrap the session's DEK
 * with a passkey's PRF output ("unlock without password").
 *
 * Body: { token, response, prfOutput }. Web session + live DEK (423). The
 * "passkey-prf" token (minted by prf-options after step-up) must be bound to
 * THIS user, THIS session and THIS credential; it is consumed atomically
 * before the assertion is verified (UV required, ownership, counter CAS).
 * Only then is the PRF output used, as HKDF key material (never as proof):
 * the session DEK is wrapped (AES-256-GCM, AAD = user|credential|version) into
 * user_passkeys.dek_wrapped_prf and prf_supported is set to 1.
 *
 * A wrong prfOutput (client bug / malicious session) can only produce a wrap
 * that never opens: it cannot grant access to anything. Failure is uniform 400.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireWebSession } from "@/lib/auth/web-session";
import { getPasskey, advancePasskeyCounter, setPasskeyPrfWrapOwned } from "@/lib/auth/queries";
import { verifyPasskeyAssertion } from "@/lib/auth/webauthn";
import { parsePrfOutput, wrapDekWithPrf, PRF_WRAP_VERSION } from "@/lib/auth/passkey-prf";
import { authenticationResponseSchema, challengeTokenSchema, prfOutputSchema } from "@/lib/auth/webauthn-schemas";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { clientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: challengeTokenSchema,
  response: authenticationResponseSchema,
  prfOutput: prfOutputSchema,
});

const FAIL = { error: "Passkey setup failed. Please try again." };

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  const auth = await requireWebSession(request);
  if (!auth.ok) return auth.response;
  const { userId, dek, sessionId } = auth.context;
  if (!dek) {
    return NextResponse.json(
      { error: "session_locked", message: "Your session needs to be unlocked. Please log in again." },
      { status: 423 }
    );
  }
  if (!checkRateLimit(`passkey-prf-finish:${userId}`, 20, 60 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => null), bodySchema);
    if (parsed.error) return NextResponse.json(FAIL, { status: 400 });
    const { token, response, prfOutput } = parsed.data;
    const prf = parsePrfOutput(prfOutput);
    if (!prf) return NextResponse.json(FAIL, { status: 400 });

    try {
      const passkey = await getPasskey(response.id);
      const verdict = await verifyPasskeyAssertion({
        token,
        purpose: "passkey-prf",
        binding: { userId, sessionId, credentialId: response.id },
        response: { ...response, clientExtensionResults: {} },
        passkey: passkey
          ? {
              id: passkey.id,
              userId: passkey.userId,
              publicKey: passkey.publicKey,
              counter: passkey.counter,
              transports: passkey.transports,
            }
          : null,
      });
      if (!verdict.ok) {
        if (passkey && passkey.userId === userId && verdict.reason === "counter_regression") {
          logSecurityEvent(userId, "passkey_counter_regression", { method: "passkey", ip: clientIp(request) }).catch(() => {});
        }
        return NextResponse.json(FAIL, { status: 400 });
      }
      const pk = passkey!;
      if (!(await advancePasskeyCounter(userId, pk.id, verdict.previousCounter, verdict.newCounter, verdict.backedUp))) {
        return NextResponse.json(FAIL, { status: 400 });
      }
      const wrapped = wrapDekWithPrf(dek, prf, { userId, credentialId: pk.id, version: PRF_WRAP_VERSION });
      if (!(await setPasskeyPrfWrapOwned(userId, pk.id, wrapped, PRF_WRAP_VERSION))) {
        return NextResponse.json(FAIL, { status: 400 });
      }
      logSecurityEvent(userId, "passkey_prf_enabled", {
        method: "passkey",
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      }).catch(() => {});
      return NextResponse.json({ id: pk.id, prfSupported: true }, { headers: { "Cache-Control": "no-store" } });
    } finally {
      prf.fill(0);
    }
  } catch (e) {
    await logApiError("POST", "/api/settings/passkeys/register/finish-prf", e);
    return NextResponse.json(FAIL, { status: 400 });
  }
}
