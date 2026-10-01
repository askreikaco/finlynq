/**
 * GET  /api/admin/integrations/email — transport status (admin + session only).
 *      Provider, From, configured flags, per-field source (db|env|none). Never key material.
 * POST /api/admin/integrations/email — send a test email `{to}` (5 / 10 min / admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateBody } from "@/lib/validate";
import { hasEmailBackup } from "@/lib/system-settings";
import {
  BAD,
  badJson,
  buildStatus,
  readJson,
  requireInteractiveSession,
  sendTestEmail,
  stepUpKindFor,
  testSendAllowed,
} from "@/lib/admin/email-integration";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;
  const denied = requireInteractiveSession(auth.context);
  if (denied) return denied;

  return NextResponse.json({
    ...(await buildStatus()),
    stepUp: await stepUpKindFor(auth.context.userId),
    canRevert: await hasEmailBackup().catch(() => false),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;
  const denied = requireInteractiveSession(auth.context);
  if (denied) return denied;

  const body = await readJson(request);
  if (body === BAD) return badJson();
  const parsed = validateBody(body, z.object({ to: z.string().email() }).strict());
  if (parsed.error) return parsed.error;

  if (!testSendAllowed(auth.context.userId)) {
    return NextResponse.json(
      { error: "Rate limited: 5 test emails per 10 minutes" },
      { status: 429 },
    );
  }

  const result = await sendTestEmail(parsed.data.to);
  if (result.ok) return NextResponse.json({ ok: true, provider: result.provider });
  return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}
