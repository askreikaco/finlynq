/**
 * PUT /api/admin/integrations/email/settings — save email transport settings.
 *
 * Admin + interactive session only (no API key / OAuth). Step-up required
 * (fresh TOTP if the admin has MFA, else password). 10 / hour / admin.
 *
 * Per field: new value replaces, `null` clears (falls back to env), omitted keeps.
 * Secrets are WRITE-ONLY. The response is only `{ fields: { <field>: {set, source} } }`
 * (+ `canRevert`, + `test` when `testTo` was given) — never a value.
 * The pre-save state is kept as a one-step backup; see ./revert.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDialect } from "@/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateBody } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, logAdminAction } from "@/lib/admin-audit";
import { resolveEmailConfig } from "@/lib/email";
import {
  EMAIL_FIELDS,
  applyEmailChanges,
  type EmailChanges,
} from "@/lib/system-settings";
import {
  BAD,
  SETTINGS_LIMIT,
  badJson,
  fieldViews,
  readJson,
  requireInteractiveSession,
  sendTestEmail,
  settingsSchema,
  testSendAllowed,
  verifyStepUp,
} from "@/lib/admin/email-integration";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;
  const denied = requireInteractiveSession(auth.context);
  if (denied) return denied;
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Admin features are only available in managed mode." }, { status: 403 });
  }
  const { userId: adminUserId } = auth.context;

  // Counts every attempt (incl. failed step-ups) so the step-up cannot be brute-forced.
  const rate = checkRateLimit(`admin-email-settings:${adminUserId}`, SETTINGS_LIMIT.max, SETTINGS_LIMIT.windowMs);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many changes. Try again later." }, { status: 429 });
  }

  const body = await readJson(request);
  if (body === BAD) return badJson();
  const parsed = validateBody(body, settingsSchema);
  if (parsed.error) return parsed.error;
  const { mfaCode, password, passkeyStepUp, testTo, ...rest } = parsed.data;

  const stepUpFail = await verifyStepUp(auth.context, { mfaCode, password, passkeyStepUp });
  if (stepUpFail) return stepUpFail;

  const changes: EmailChanges = {};
  for (const f of EMAIL_FIELDS) {
    const v = rest[f];
    if (v === undefined) continue;
    changes[f] = v === null ? null : String(v);
  }

  const beforeCfg = await resolveEmailConfig();
  const beforeViews = fieldViews(beforeCfg);
  try {
    await applyEmailChanges(adminUserId, changes);
  } catch {
    return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  }

  const afterViews = fieldViews(await resolveEmailConfig());
  const changed = Object.keys(changes).filter((f) => changes[f as keyof EmailChanges] !== null);
  const cleared = Object.keys(changes).filter((f) => changes[f as keyof EmailChanges] === null);
  await logAdminAction({
    adminUserId,
    action: "email_settings_update",
    // Field names + sources only — never values.
    before: { sources: Object.fromEntries(EMAIL_FIELDS.map((f) => [f, beforeViews[f].source])) },
    after: {
      changed,
      cleared,
      sources: Object.fromEntries(EMAIL_FIELDS.map((f) => [f, afterViews[f].source])),
    },
    ip: clientIp(request),
  });

  const out: Record<string, unknown> = { fields: afterViews, canRevert: true };
  if (testTo) {
    if (!testSendAllowed(adminUserId)) {
      out.test = { ok: false, error: "Rate limited: 5 test emails per 10 minutes" };
    } else {
      const r = await sendTestEmail(testTo);
      out.test = r.ok ? { ok: true, provider: r.provider } : { ok: false, error: r.error };
    }
  }
  return NextResponse.json(out);
}
