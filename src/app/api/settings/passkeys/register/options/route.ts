/**
 * POST /api/settings/passkeys/register/options — begin passkey registration.
 *
 * Web session + live DEK (423) + step-up (password unless session < 10 min).
 * Rate limit 10/h per user. Returns WebAuthn creation options and a signed,
 * single-use "passkey-register" token bound to {user, session}.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireWebSession, enforcePasswordStepUp } from "@/lib/auth/web-session";
import { getUserById, listPasskeys } from "@/lib/auth/queries";
import { beginRegistration, MAX_PASSKEYS_PER_USER } from "@/lib/auth/webauthn";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
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
  const rl = checkRateLimit(`passkey-register:${userId}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => ({})), bodySchema);
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

    const existing = await listPasskeys(userId);
    if (existing.length >= MAX_PASSKEYS_PER_USER) {
      return NextResponse.json({ error: "Passkey limit reached." }, { status: 400 });
    }
    const { options, token } = await beginRegistration({
      userId,
      userName: (user.username as string | null) || (user.email as string | null) || userId,
      sessionId,
      existing: existing.map((p) => ({ id: p.id, transports: p.transports })),
    });
    return NextResponse.json({ options, token }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await logApiError("POST", "/api/settings/passkeys/register/options", e);
    return NextResponse.json({ error: "Failed to start passkey registration." }, { status: 500 });
  }
}
