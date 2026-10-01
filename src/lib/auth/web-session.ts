/**
 * Guards shared by sensitive account-settings routes (passkeys).
 *
 * requireWebSession: interactive browser/JWT session only. API keys and OAuth
 * bearer tokens never reach passkey management (a passkey is a login factor).
 * Pending-MFA JWTs are already refused by AccountStrategy (401 mfa-pending)
 * on every path except /api/auth/mfa/verify.
 *
 * enforcePasswordStepUp: plan Q5 — currentPassword unless the session is
 * < 10 min old (isFreshSession). Wrong-password attempts are rate limited per
 * user so a stolen session cannot be used as a password-guessing oracle.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { isFreshSession } from "@/lib/auth/step-up";
import { verifyPassword } from "@/lib/auth/passwords";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { logSecurityEvent } from "@/lib/auth/security-events";
import type { AuthContext } from "@/lib/auth/strategy";

export async function requireWebSession(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return { ok: false as const, response: auth.response };
  if (auth.context.method !== "account" || !auth.context.sessionId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "This action requires a signed-in browser session." },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, context: auth.context as AuthContext & { sessionId: string } };
}

export async function enforcePasswordStepUp(opts: {
  request: NextRequest;
  userId: string;
  iat: number | undefined;
  passwordHash: string;
  currentPassword: string | undefined;
  /** Security-event method label, e.g. "passkey-stepup". */
  label: string;
}): Promise<NextResponse | null> {
  if (isFreshSession(opts.iat)) return null;
  if (!opts.currentPassword) {
    return NextResponse.json({ error: "Password required for this action." }, { status: 401 });
  }
  const rl = checkRateLimit(`stepup:${opts.userId}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  if (!(await verifyPassword(opts.currentPassword, opts.passwordHash))) {
    logSecurityEvent(opts.userId, "recovery_proof_failed", {
      method: opts.label,
      ip: clientIp(opts.request),
      userAgent: opts.request.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
    return NextResponse.json({ error: "Your password is incorrect." }, { status: 401 });
  }
  return null;
}
