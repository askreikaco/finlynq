/**
 * POST /api/auth/passkey/login/options — passkey sign-in (no password), step 1.
 *
 * Body: { credentialId? }. No auth. Returns WebAuthn request options (UV
 * required) and a signed single-use "passkey-login" token bound to NO user
 * (anonymous): the credential named by the assertion identifies the account.
 *
 * Per-credential PRF salts cannot be known before the user picks a credential,
 * so options are discoverable (empty allowList) and the verify route runs a
 * second credential-scoped step to evaluate PRF. A client that remembers a
 * credential id passes it as `credentialId` and gets allowCredentials=[id] +
 * that credential's salt for a one-prompt login. The hint is looked up
 * NOWHERE: the salt is a pure function of the id, so the response is identical
 * for real and unknown ids (no existence oracle).
 *
 * CSRF: NOT in middleware CSRF_BYPASS_PATHS (same as the other passkey routes).
 * Limits: per-IP 20/15min.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { beginPasskeyAssertion, ANON_USER } from "@/lib/auth/passkey-prf";
import { credentialIdHintSchema } from "@/lib/auth/webauthn-schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ credentialId: credentialIdHintSchema.optional() });

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  if (!checkRateLimit(`passkey-login-options:${clientIp(request)}`, 20, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => ({})), bodySchema);
    if (parsed.error) return parsed.error;
    const hint = parsed.data.credentialId;
    const out = await beginPasskeyAssertion({
      purpose: "passkey-login",
      bind: { userId: ANON_USER },
      credential: hint ? { id: hint } : undefined,
    });
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await logApiError("POST", "/api/auth/passkey/login/options", e);
    return NextResponse.json({ error: "Passkey sign-in failed." }, { status: 400 });
  }
}
