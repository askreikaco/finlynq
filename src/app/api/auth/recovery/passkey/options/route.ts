/**
 * POST /api/auth/recovery/passkey/options — recover access with a passkey, step 1.
 *
 * Body: { credentialId? }. No auth. Same shape as passkey/login/options but a
 * distinct "passkey-recovery" token purpose (a login token can never finish a
 * recovery and vice versa). UV required. See login/options for the hint rules.
 *
 * CSRF: NOT in middleware CSRF_BYPASS_PATHS. Limits: per-IP 5/15min.
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
const GENERIC_FAIL = "Recovery failed. Check your details and try again.";

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  if (!checkRateLimit(`recovery-passkey-options:${clientIp(request)}`, 5, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => ({})), bodySchema);
    if (parsed.error) return NextResponse.json({ error: GENERIC_FAIL }, { status: 400 });
    const hint = parsed.data.credentialId;
    const out = await beginPasskeyAssertion({
      purpose: "passkey-recovery",
      bind: { userId: ANON_USER },
      credential: hint ? { id: hint } : undefined,
    });
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await logApiError("POST", "/api/auth/recovery/passkey/options", e);
    return NextResponse.json({ error: GENERIC_FAIL }, { status: 400 });
  }
}
