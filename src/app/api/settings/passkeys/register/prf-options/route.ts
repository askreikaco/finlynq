/**
 * POST /api/settings/passkeys/register/prf-options — begin enabling
 * "unlock without password" (PRF wrap) for one of the caller's passkeys.
 *
 * Used right after registration (needsPrfAssertion) or later from settings.
 * Web session + live DEK (423) + step-up (password unless the session is
 * < 10 min old) + ownership of the credential (404 otherwise). Returns
 * credential-scoped assertion options (UV required), that credential's PRF
 * salt (eval.first) and a single-use "passkey-prf" token bound to
 * {user, session, credential}. Limit 10/h per user.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireWebSession, enforcePasswordStepUp } from "@/lib/auth/web-session";
import { getUserById, getPasskey } from "@/lib/auth/queries";
import { beginPasskeyAssertion } from "@/lib/auth/passkey-prf";
import { credentialIdHintSchema } from "@/lib/auth/webauthn-schemas";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  credentialId: credentialIdHintSchema,
  currentPassword: z.string().min(1).max(256).optional(),
});

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  const auth = await requireWebSession(request);
  if (!auth.ok) return auth.response;
  const { userId, dek, iat, sessionId } = auth.context;
  if (!dek) {
    return NextResponse.json(
      { error: "session_locked", message: "Your session needs to be unlocked. Please log in again." },
      { status: 423 }
    );
  }
  if (!checkRateLimit(`passkey-prf-options:${userId}`, 10, 60 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => null), bodySchema);
    if (parsed.error) return parsed.error;
    const user = await getUserById(userId);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const denied = await enforcePasswordStepUp({
      request,
      userId,
      iat,
      passwordHash: user.passwordHash as string,
      currentPassword: parsed.data.currentPassword,
      label: "passkey-stepup",
    });
    if (denied) return denied;

    const passkey = await getPasskey(parsed.data.credentialId);
    if (!passkey || passkey.userId !== userId) {
      return NextResponse.json({ error: "Passkey not found." }, { status: 404 });
    }
    const out = await beginPasskeyAssertion({
      purpose: "passkey-prf",
      bind: { userId, sessionId, credentialId: passkey.id },
      credential: { id: passkey.id, transports: passkey.transports, saltVersion: passkey.prfSaltVersion ?? 1 },
    });
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await logApiError("POST", "/api/settings/passkeys/register/prf-options", e);
    return NextResponse.json({ error: "Failed to start passkey setup." }, { status: 500 });
  }
}
