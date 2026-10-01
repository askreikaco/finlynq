/**
 * Resolve a pending-MFA token for routes that verify it IN-ROUTE (not through
 * AccountStrategy, which refuses pending JWTs everywhere except
 * /api/auth/mfa/verify). Same contract as mfa/verify + mfa/recovery/verify:
 * body field first, pf_unlock cookie fallback; must be a pending token with a
 * jti; revoked / expired / deploy-stale tokens fail via
 * verifySessionTokenDetailed.
 */
import type { NextRequest } from "next/server";
import { verifySessionTokenDetailed } from "@/lib/auth/jwt";

export interface PendingMfa {
  userId: string;
  jti: string;
  /** Epoch seconds (0 if absent). */
  exp: number;
}

export async function resolvePendingMfa(
  request: NextRequest,
  bodyToken: string | undefined
): Promise<PendingMfa | null> {
  const token = bodyToken ?? request.cookies.get("pf_unlock")?.value;
  if (!token) return null;
  const { payload } = await verifySessionTokenDetailed(token);
  if (!payload || !payload.sub || !payload.pending) return null;
  const jti = payload.jti as string | undefined;
  if (!jti) return null;
  return { userId: payload.sub, jti, exp: typeof payload.exp === "number" ? payload.exp : 0 };
}
