/**
 * POST /api/settings/passkeys/register/verify — finish passkey registration.
 *
 * Web session + live DEK. The "passkey-register" token (issued after step-up
 * at /register/options) must be bound to THIS user and THIS session, and is
 * consumed atomically before the attestation is verified (UV required,
 * origin/rpID from server config, attestation "none").
 *
 * label is optional (client no longer asks): see lib/auth/passkey-name.ts.
 *
 * PRF key-wrap (B6) is a second step: prf_supported stays 0 / dek_wrapped_prf NULL
 * here; the response tells the browser to run register/prf-options ->
 * (second tap with PRF eval) -> register/finish-prf, unless the browser already
 * said the authenticator has no PRF (clientExtensionResults.prf.enabled === false;
 * a UI hint only, nothing server-side trusts it).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireWebSession } from "@/lib/auth/web-session";
import { getPasskey, insertPasskey, countPasskeys, listPasskeys } from "@/lib/auth/queries";
import { finishRegistration, MAX_PASSKEYS_PER_USER } from "@/lib/auth/webauthn";
import { registrationResponseSchema, challengeTokenSchema } from "@/lib/auth/webauthn-schemas";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { clientIp } from "@/lib/client-ip";
import { generatePasskeyName } from "@/lib/auth/passkey-name";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: challengeTokenSchema,
  response: registrationResponseSchema,
  label: z.string().trim().min(1).max(60).optional(),
});

const FAIL = { error: "Passkey registration failed. Please try again." };

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
  const rl = checkRateLimit(`passkey-register-verify:${userId}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => null), bodySchema);
    if (parsed.error) return NextResponse.json(FAIL, { status: 400 });
    const { token, response, label: providedLabel } = parsed.data;

    const result = await finishRegistration({ userId, sessionId, token, response });
    if (!result.ok) return NextResponse.json(FAIL, { status: 400 });
    const cred = result.credential;

    // Credential ids are globally unique (PK). Never overwrite / adopt another
    // account's credential; same generic failure.
    if (await getPasskey(cred.credentialId)) return NextResponse.json(FAIL, { status: 400 });
    if ((await countPasskeys(userId)) >= MAX_PASSKEYS_PER_USER) {
      return NextResponse.json({ error: "Passkey limit reached." }, { status: 400 });
    }
    // Name is optional: a provided label wins; otherwise AAGUID provider, then UA, then "Passkey".
    const label =
      providedLabel ??
      generatePasskeyName({
        aaguid: cred.aaguid,
        userAgent: request.headers.get("user-agent"),
        existingLabels: (await listPasskeys(userId)).map((p) => p.label),
      });
    try {
      await insertPasskey({
        id: cred.credentialId,
        userId,
        publicKey: cred.publicKey,
        counter: cred.counter,
        transports: cred.transports,
        aaguid: cred.aaguid,
        backedUp: cred.backedUp,
        label,
        prfSupported: 0,
        dekWrappedPrf: null,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      });
    } catch {
      return NextResponse.json(FAIL, { status: 400 }); // PK race
    }
    logSecurityEvent(userId, "passkey_added", {
      method: "passkey",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
    return NextResponse.json(
      {
        id: cred.credentialId,
        label,
        prfSupported: false,
        needsPrfAssertion: (response.clientExtensionResults as { prf?: { enabled?: boolean } } | undefined)?.prf?.enabled !== false,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    await logApiError("POST", "/api/settings/passkeys/register/verify", e);
    return NextResponse.json(FAIL, { status: 400 });
  }
}
