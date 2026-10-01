/**
 * GET /api/settings/recovery-codes — list recovery codes (count only, never plaintext)
 * POST /api/settings/recovery-codes — generate/regenerate recovery codes
 *
 * Requires:
 * - Session + DEK (423 if no DEK)
 * - Step-up: currentPassword OR fresh session (iat < 10 min)
 * - Rate limit: 5/hour per user
 *
 * POST returns codes ONCE (display format). Stores only hashes + DEK wraps.
 * GET returns {unused, total, createdAt} — never returns plaintext codes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireAuth } from "@/lib/auth/require-auth";
import { isFreshSession } from "@/lib/auth/step-up";
import { verifyPassword } from "@/lib/auth";
import { getUserById, replaceRecoveryCodes, getRecoveryCodeStatus } from "@/lib/auth/queries";
import { generateRecoveryCodes, hashRecoveryCode, wrapDEKWithRecoveryCode } from "@/lib/auth/recovery-codes";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { clientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const postBodySchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(256).optional(),
});

/**
 * Web-session only: API keys / OAuth bearer tokens must never read recovery
 * state or mint codes (a code is a full account-recovery credential).
 */
async function requireWebSession(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return { ok: false as const, response: auth.response };
  if (auth.context.method !== "account") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "This action requires a signed-in browser session." },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, context: auth.context };
}

export async function GET(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Recovery codes are only available in managed mode." },
      { status: 403 }
    );
  }
  const auth = await requireWebSession(request);
  if (!auth.ok) return auth.response;

  try {
    const { unused, total, createdAt } = await getRecoveryCodeStatus(auth.context.userId);
    return NextResponse.json({ unused, total, createdAt }, { headers: NO_STORE });
  } catch (e) {
    await logApiError("GET", "/api/settings/recovery-codes", e);
    return NextResponse.json({ error: "Failed to retrieve recovery codes." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Recovery codes are only available in managed mode." },
      { status: 403 }
    );
  }
  const auth = await requireWebSession(request);
  if (!auth.ok) return auth.response;
  const { userId, dek, iat } = auth.context;
  // Live session DEK required (each code wraps it).
  if (!dek) {
    return NextResponse.json(
      { error: "session_locked", message: "Your session needs to be unlocked. Please log in again." },
      { status: 423 }
    );
  }

  const rl = checkRateLimit(`recovery-codes-generate:${userId}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const parsed = validateBody(await request.json().catch(() => ({})), postBodySchema);
    if (parsed.error) return parsed.error;
    const { currentPassword } = parsed.data;

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Step-up: password required UNLESS the session is < 10 min old.
    if (!isFreshSession(iat)) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Password required for this action." }, { status: 401 });
      }
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        logSecurityEvent(userId, "recovery_proof_failed", {
          method: "codes-stepup",
          ip: clientIp(request),
          userAgent: request.headers.get("user-agent") ?? undefined,
        }).catch(() => {});
        return NextResponse.json({ error: "Your password is incorrect." }, { status: 401 });
      }
    }

    const generated = generateRecoveryCodes(10);
    // Only hash + DEK wrap are stored; the plaintext exists in this response only.
    await replaceRecoveryCodes(
      userId,
      generated.map(({ canonical }) => ({
        hash: hashRecoveryCode(canonical),
        dekWrapped: wrapDEKWithRecoveryCode(dek, canonical),
      }))
    );

    logSecurityEvent(userId, "recovery_code_generated", {
      method: "settings",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    }).catch(() => {});

    return NextResponse.json(
      { codes: generated.map((c) => c.display), createdAt: new Date().toISOString() },
      { headers: NO_STORE }
    );
  } catch (e) {
    await logApiError("POST", "/api/settings/recovery-codes", e);
    return NextResponse.json({ error: "Failed to generate recovery codes." }, { status: 500 });
  }
}
