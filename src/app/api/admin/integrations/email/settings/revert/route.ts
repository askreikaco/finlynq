/**
 * POST /api/admin/integrations/email/settings/revert — restore the one-step
 * backup taken by the last PUT, then consume it. Same gates as PUT
 * (admin + session, step-up, shared 10/hour limit). Response: `{ fields }` only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateBody } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, logAdminAction } from "@/lib/admin-audit";
import { resolveEmailConfig } from "@/lib/email";
import { EMAIL_FIELDS, revertEmailChanges } from "@/lib/system-settings";
import {
  BAD,
  SETTINGS_LIMIT,
  badJson,
  fieldViews,
  readJson,
  requireInteractiveSession,
  verifyStepUp,
} from "@/lib/admin/email-integration";

export const dynamic = "force-dynamic";

const revertSchema = z
  .object({ mfaCode: z.string().length(6).optional(), password: z.string().min(1).max(1024).optional() })
  .strict();

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;
  const denied = requireInteractiveSession(auth.context);
  if (denied) return denied;
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Admin features are only available in managed mode." }, { status: 403 });
  }
  const { userId: adminUserId } = auth.context;

  const rate = checkRateLimit(`admin-email-settings:${adminUserId}`, SETTINGS_LIMIT.max, SETTINGS_LIMIT.windowMs);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many changes. Try again later." }, { status: 429 });
  }

  const body = await readJson(request);
  if (body === BAD) return badJson();
  const parsed = validateBody(body, revertSchema);
  if (parsed.error) return parsed.error;

  const stepUpFail = await verifyStepUp(auth.context, parsed.data);
  if (stepUpFail) return stepUpFail;

  const before = fieldViews(await resolveEmailConfig());
  let restored: boolean;
  try {
    restored = await revertEmailChanges(adminUserId);
  } catch {
    return NextResponse.json({ error: "Could not revert settings." }, { status: 500 });
  }
  if (!restored) return NextResponse.json({ error: "Nothing to revert." }, { status: 404 });

  const after = fieldViews(await resolveEmailConfig());
  await logAdminAction({
    adminUserId,
    action: "email_settings_revert",
    before: { sources: Object.fromEntries(EMAIL_FIELDS.map((f) => [f, before[f].source])) },
    after: { sources: Object.fromEntries(EMAIL_FIELDS.map((f) => [f, after[f].source])) },
    ip: clientIp(request),
  });
  return NextResponse.json({ fields: after, canRevert: false });
}
