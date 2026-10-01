/**
 * Shared guard + helpers for /api/family/manage/* routes.
 *
 * - Session-only: AuthContext.method must be "account" (api_key / oauth / passphrase -> 403).
 * - CSRF for cookie-authenticated POST/PUT is enforced globally by src/middleware.ts csrfCheck.
 * - Responses never carry key material, token hashes, user ids or other users' emails.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import type { AuthContext } from "@/lib/auth/strategy";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveSections } from "./sections";

export type GuardResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse };

export async function requireFamilySession(request: NextRequest): Promise<GuardResult> {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return { ok: false, response: auth.response };
  if (auth.context.method !== "account") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Only session authentication is allowed" }, { status: 403 }),
    };
  }
  return { ok: true, ctx: auth.context };
}

export function rateLimited(resetAt: number, error = "Too many requests. Try again later."): NextResponse {
  return NextResponse.json(
    { error },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } },
  );
}

/** Generic management limiter: 30 requests / minute / user. */
export function manageLimit(userId: string): NextResponse | null {
  const rl = checkRateLimit(`family-manage:${userId}`, 30, 60_000);
  return rl.allowed ? null : rateLimited(rl.resetAt);
}

export async function readStrictBody<S extends z.ZodTypeAny>(
  request: NextRequest,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid request body" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Validation failed",
          // path + message only: never echo submitted values
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Same body for every rejected / unknown / foreign invite token (anti-enumeration). */
export function inviteGone(): NextResponse {
  return NextResponse.json({ error: "Invitation not found or already used" }, { status: 410 });
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export function isCheckViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23514" || e?.cause?.code === "23514";
}

interface ShareRow {
  id: string;
  ownerId: string;
  viewerId: string | null;
  viewerEmailLower: string;
  sections: string[];
  allSections: boolean;
  mustShareBack: boolean;
  requiredBackSections: string[] | null;
  reciprocalOf: string | null;
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
  lastViewedAt: Date | null;
}

/**
 * Allow-list DTO. Owner view shows the invite email THEY typed; viewer view shows the owner's
 * display name only. No user ids, no keys, no token data.
 */
export function toShareDto(share: ShareRow, role: "owner" | "viewer", counterpartName: string | null) {
  return {
    id: share.id,
    role,
    status: share.status,
    sections: resolveSections(share.allSections, share.sections),
    mustShareBack: share.mustShareBack,
    requiredBackSections: share.requiredBackSections ?? [],
    isReciprocal: share.reciprocalOf !== null,
    createdAt: share.createdAt.toISOString(),
    ...(share.acceptedAt ? { acceptedAt: share.acceptedAt.toISOString() } : {}),
    ...(share.lastViewedAt && role === "owner" ? { lastViewedAt: share.lastViewedAt.toISOString() } : {}),
    counterparty:
      role === "owner"
        ? { email: share.viewerEmailLower, ...(counterpartName ? { name: counterpartName } : {}) }
        : { name: counterpartName ?? "A Finlynq user" },
  };
}
