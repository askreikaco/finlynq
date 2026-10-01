/**
 * POST /api/auth/step-up/passkey/options — begin a passkey step-up.
 *
 * Body: { action } (one of STEP_UP_ACTIONS). Web session only (not in CSRF
 * bypass: Origin check applies). Returns WebAuthn request options limited to
 * the caller's passkeys (UV required) and a single-use "passkey-stepup"
 * token bound to {user, session, action}. The signed assertion is then sent
 * back to the action route as { passkeyStepUp: { token, response } }.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireWebSession } from "@/lib/auth/web-session";
import { beginPasskeyStepUp, STEP_UP_ACTIONS } from "@/lib/auth/passkey-stepup";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ action: z.enum(STEP_UP_ACTIONS) });

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  const auth = await requireWebSession(request);
  if (!auth.ok) return auth.response;
  const { userId, sessionId } = auth.context;
  if (!checkRateLimit(`passkey-stepup-options:${userId}`, 20, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => null), bodySchema);
    if (parsed.error) return parsed.error;
    const out = await beginPasskeyStepUp({ userId, sessionId, action: parsed.data.action });
    if (!out) return NextResponse.json({ error: "No passkey is registered for this account." }, { status: 400 });
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await logApiError("POST", "/api/auth/step-up/passkey/options", e);
    return NextResponse.json({ error: "Passkey verification failed." }, { status: 400 });
  }
}
