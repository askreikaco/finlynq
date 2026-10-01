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
import { requireEncryption } from "@/lib/auth/require-encryption";
import { requireAuth } from "@/lib/auth/require-auth";
import { isFreshSession } from "@/lib/auth/step-up";
import { verifyPassword } from "@/lib/auth";
import { getUserById, replaceRecoveryCodes, countUnusedRecoveryCodes } from "@/lib/auth/queries";
import { generateRecoveryCodes, hashRecoveryCode, wrapDEKWithRecoveryCode } from "@/lib/auth/recovery-codes";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/auth/security-events";

export const dynamic = "force-dynamic";

const postBodySchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(256).optional(),
});

export async function GET(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Recovery codes are only available in managed mode." },
      { status: 403 }
    );
  }

  const auth = await requireEncryption(request);
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  try {
    const unused = await countUnusedRecoveryCodes(userId);
    const total = 10; // We always maintain 10 codes per user

    // Get the creation date from the first (most recent) recovery code
    const { db } = await import("@/db");
    const { desc, eq } = await import("drizzle-orm");
    const { userRecoveryCodes } = await import("@/db/schema-pg");

    const latestCode = await db
      .select({ createdAt: userRecoveryCodes.createdAt })
      .from(userRecoveryCodes)
      .where(eq(userRecoveryCodes.userId, userId))
      .orderBy(desc(userRecoveryCodes.createdAt))
      .limit(1);

    const createdAt = latestCode[0]?.createdAt ?? null;

    return NextResponse.json({
      unused,
      total,
      createdAt,
    });
  } catch (e) {
    await logApiError("GET", "/api/settings/recovery-codes", e);
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed to retrieve recovery codes.") },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Recovery codes are only available in managed mode." },
      { status: 403 }
    );
  }

  const encAuth = await requireEncryption(request);
  if (!encAuth.ok) return encAuth.response;
  const { userId, dek } = encAuth;

  // Also need the auth context for iat (step-up freshness check)
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  // Per-user rate limit: 5 attempts per hour
  const rl = checkRateLimit(`recovery-codes-generate:${userId}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const parsed = validateBody(await request.json(), postBodySchema);
    if (parsed.error) return parsed.error;
    const { currentPassword } = parsed.data;

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Step-up: require currentPassword UNLESS session is fresh (< 10 min old)
    const fresh = isFreshSession(auth.context.iat);
    if (!fresh) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Password required for this action." },
          { status: 401 }
        );
      }

      // Verify the password
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json(
          { error: "Your password is incorrect." },
          { status: 401 }
        );
      }
    }

    // Generate 10 recovery codes
    const generatedCodes = generateRecoveryCodes(10);

    // Hash codes and wrap DEK for each
    const codesToStore = generatedCodes.map(({ canonical }) => ({
      hash: hashRecoveryCode(canonical),
      dekWrapped: wrapDEKWithRecoveryCode(dek, canonical),
    }));

    // Store in DB (replaces all old codes in transaction)
    await replaceRecoveryCodes(userId, codesToStore);

    // Log security event
    logSecurityEvent(userId, "recovery_code_generated", {
      method: "settings",
      userAgent: request.headers.get("user-agent") ?? undefined,
    }).catch(() => {});

    // Return display format (ONLY in response, never stored)
    return NextResponse.json({
      codes: generatedCodes.map((c) => c.display),
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    await logApiError("POST", "/api/settings/recovery-codes", e);
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed to generate recovery codes.") },
      { status: 500 }
    );
  }
}
