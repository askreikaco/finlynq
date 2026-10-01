/**
 * POST /api/auth/mfa/webauthn/options — passkey as 2FA, step 1.
 *
 * Called after /api/auth/login returns { mfaRequired: true }. Body:
 * { mfaPendingToken? } (or pf_unlock cookie). Verifies the pending JWT
 * in-route (a full session is rejected), then returns WebAuthn request
 * options limited to THIS user's credentials (UV required) plus a signed,
 * single-use "passkey-2fa" token bound to {user, pending jti}.
 *
 * CSRF: NOT in middleware CSRF_BYPASS_PATHS (same as mfa/verify).
 * Limits: per-IP 20/15min, per-pending-jti 10 / 5 min.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { resolvePendingMfa } from "@/lib/auth/pending-mfa";
import { listPasskeys } from "@/lib/auth/queries";
import { beginAuthentication2fa } from "@/lib/auth/webauthn";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ mfaPendingToken: z.string().min(1).max(4096).optional() });

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`mfa-webauthn-options:${clientIp(request)}`, 20, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => ({})), bodySchema);
    if (parsed.error) return parsed.error;
    const pending = await resolvePendingMfa(request, parsed.data.mfaPendingToken);
    if (!pending) {
      return NextResponse.json(
        { error: "Invalid or expired pending token. Please log in again." },
        { status: 401 }
      );
    }
    if (!checkRateLimit(`mfa-webauthn-options-jti:${pending.jti}`, 10, 5 * 60_000).allowed) {
      return NextResponse.json({ error: "Too many attempts. Please log in again." }, { status: 429 });
    }
    const passkeys = await listPasskeys(pending.userId);
    if (passkeys.length === 0) {
      return NextResponse.json({ error: "No passkey is registered for this account." }, { status: 400 });
    }
    const { options, token } = await beginAuthentication2fa({
      userId: pending.userId,
      pendingJti: pending.jti,
      credentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    });
    return NextResponse.json({ options, token }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await logApiError("POST", "/api/auth/mfa/webauthn/options", e);
    return NextResponse.json({ error: "Passkey verification failed." }, { status: 400 });
  }
}
