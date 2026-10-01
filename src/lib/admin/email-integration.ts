/**
 * Shared helpers for /api/admin/integrations/email*: step-up check, request
 * schema, test send, error sanitising, and the key-material-free status view.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyMfaCode, verifyPassword } from "@/lib/auth";
import { getUserById } from "@/lib/auth/queries";
import { getDEK } from "@/lib/crypto/dek-cache";
import { decryptField } from "@/lib/crypto/envelope";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  activeEmailProvider,
  parseFromAddress,
  resolveEmailConfig,
  sendEmail,
  type EmailConfig,
} from "@/lib/email";
import { EMAIL_FIELDS, type EmailField } from "@/lib/system-settings";
import type { AuthContext } from "@/lib/auth/strategy";
import { stepUpMethodFor, verifyPasskeyStepUp, passkeyStepUpSchema, type PasskeyStepUpInput } from "@/lib/auth/passkey-stepup";

export const TEST_SEND_LIMIT = { max: 5, windowMs: 10 * 60_000 };
export const SETTINGS_LIMIT = { max: 10, windowMs: 60 * 60_000 };

/** Session-only gate: API keys / OAuth tokens (no interactive session) are refused. */
export function requireInteractiveSession(ctx: AuthContext): NextResponse | null {
  if (!ctx.sessionId || ctx.method === "api_key" || ctx.method === "oauth") {
    return NextResponse.json({ error: "Session required." }, { status: 403 });
  }
  return null;
}

export type StepUpKind = "mfa" | "password" | "passkey";

/** TOTP admins: "mfa"; passkey-only admins: "passkey" (assertion); others: "password". */
export async function stepUpKindFor(userId: string): Promise<StepUpKind> {
  const u = await getUserById(userId);
  if (!u) return "password";
  const m = await stepUpMethodFor(u);
  return m === "totp" ? "mfa" : m === "passkey" ? "passkey" : "password";
}

/**
 * Step-up: fresh TOTP when the admin has MFA (same as /api/admin/users PATCH),
 * else the admin's password (same as /api/auth/delete-account). Returns a
 * response to send on failure, or null when the step-up passed.
 */
export async function verifyStepUp(
  ctx: AuthContext,
  input: { mfaCode?: string; password?: string; passkeyStepUp?: PasskeyStepUpInput },
): Promise<NextResponse | null> {
  const admin = await getUserById(ctx.userId);
  if (!admin) return NextResponse.json({ error: "Admin user not found." }, { status: 404 });

  // Passkey-only admin: a fresh UV assertion bound to this session + action
  // (a password alone is not accepted).
  if ((await stepUpMethodFor(admin)) === "passkey") {
    if (!input.passkeyStepUp) {
      return NextResponse.json(
        { error: "Passkey verification required for settings changes.", code: "PASSKEY_REQUIRED" },
        { status: 403 },
      );
    }
    const ok = await verifyPasskeyStepUp({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      action: "admin-email-integration",
      input: input.passkeyStepUp,
    });
    return ok ? null : NextResponse.json({ error: "Passkey verification failed." }, { status: 401 });
  }

  if (admin.mfaEnabled && admin.mfaSecret) {
    if (!input.mfaCode) {
      return NextResponse.json(
        { error: "MFA code required for settings changes.", code: "MFA_REQUIRED" },
        { status: 403 },
      );
    }
    // SESSION-DEK-REQUIRED: decrypts the admin's own TOTP secret for the step-up.
    const dek = ctx.sessionId ? getDEK(ctx.sessionId, ctx.userId) : null;
    if (!dek) {
      return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 423 });
    }
    let secret: string | null;
    try {
      secret = decryptField(dek, admin.mfaSecret);
    } catch {
      return NextResponse.json({ error: "MFA secret could not be decrypted." }, { status: 500 });
    }
    if (!secret || !verifyMfaCode(secret, input.mfaCode)) {
      return NextResponse.json({ error: "Invalid MFA code." }, { status: 401 });
    }
    return null;
  }

  if (!input.password) {
    return NextResponse.json(
      { error: "Password required for settings changes.", code: "PASSWORD_REQUIRED" },
      { status: 403 },
    );
  }
  if (!(await verifyPassword(input.password, admin.passwordHash ?? ""))) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 401 });
  }
  return null;
}

// ─── Request schema ─────────────────────────────────────────────────────────

const NO_CTL = /^[^\x00-\x1f\x7f]+$/;
const emailAddr = z.string().email();

const fromField = z
  .string()
  .max(200)
  .regex(NO_CTL, "Invalid characters")
  .refine((v) => emailAddr.safeParse(parseFromAddress(v).email).success, "Invalid From address");
const apiKey = z.string().min(1).max(512).regex(/^[^\s\x00-\x1f\x7f]+$/, "Invalid characters");
const plainSecret = z.string().min(1).max(512).regex(NO_CTL, "Invalid characters");
const host = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/, "Invalid host");

export const settingsSchema = z
  .object({
    provider: z.enum(["auto", "brevo", "resend", "smtp"]).optional(),
    from: fromField.nullable().optional(),
    brevoApiKey: apiKey.nullable().optional(),
    resendApiKey: apiKey.nullable().optional(),
    smtpHost: host.nullable().optional(),
    smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
    smtpUser: plainSecret.nullable().optional(),
    smtpPass: plainSecret.nullable().optional(),
    mfaCode: z.string().length(6).optional(),
    password: z.string().min(1).max(1024).optional(),
    passkeyStepUp: passkeyStepUpSchema.optional(),
    testTo: z.string().email().optional(),
  })
  .strict();

// ─── Status view (never contains key material) ──────────────────────────────

export interface EmailFieldView {
  set: boolean;
  source: "db" | "env" | "none";
}

export function fieldViews(cfg: EmailConfig): Record<EmailField, EmailFieldView> {
  const out = {} as Record<EmailField, EmailFieldView>;
  for (const f of EMAIL_FIELDS) out[f] = { set: cfg[f].value !== undefined, source: cfg[f].source };
  return out;
}

export async function buildStatus(): Promise<Record<string, unknown>> {
  const cfg = await resolveEmailConfig();
  const { name, email } = parseFromAddress(cfg.from.value || "Finlynq <noreply@finlynq.com>");
  return {
    provider: activeEmailProvider(cfg),
    from: { name: name || "Finlynq", address: email },
    configured: {
      brevo: !!cfg.brevoApiKey.value,
      resend: !!cfg.resendApiKey.value,
      smtp: !!cfg.smtpHost.value,
    },
    sources: Object.fromEntries(EMAIL_FIELDS.map((f) => [f, cfg[f].source])),
    // Non-secret values only (the form needs them). Keys/user/pass are never returned.
    values: {
      provider: cfg.provider.value ?? "auto",
      from: cfg.from.value ?? "",
      smtpHost: cfg.smtpHost.value ?? "",
      smtpPort: cfg.smtpPort.value ? Number(cfg.smtpPort.value) || null : null,
    },
  };
}

// ─── Test send ──────────────────────────────────────────────────────────────

export function testSendAllowed(adminUserId: string): boolean {
  return checkRateLimit(`admin-email-test:${adminUserId}`, TEST_SEND_LIMIT.max, TEST_SEND_LIMIT.windowMs).allowed;
}

/** Strip every configured secret value and common credential shapes from an error. */
export function sanitizeEmailError(message: string, cfg: EmailConfig): string {
  let out = message;
  for (const f of ["brevoApiKey", "resendApiKey", "smtpUser", "smtpPass"] as const) {
    const v = cfg[f].value;
    if (v && v.length >= 3) out = out.split(v).join("***");
  }
  out = out
    .replace(/xkeysib-[A-Za-z0-9_-]+/g, "***")
    .replace(/\bre_[A-Za-z0-9_-]+/g, "***")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, "Bearer ***")
    .replace(/(api-key|apikey|password|pass|secret|token)(["']?\s*[=:]\s*["']?)[^\s,"'}]+/gi, "$1$2***");
  return out.length > 200 ? out.slice(0, 200) + "..." : out;
}

export type TestSendResult =
  | { ok: true; provider: string }
  | { ok: false; status: number; error: string };

export async function sendTestEmail(to: string): Promise<TestSendResult> {
  const cfg = await resolveEmailConfig();
  const provider = activeEmailProvider(cfg);
  if (provider === "none") return { ok: false, status: 503, error: "No email provider configured" };
  const at = new Date().toISOString();
  try {
    await sendEmail({
      to,
      subject: "Finlynq test email",
      html: `<p>This is a test email from Finlynq.</p><p>Sent via <strong>${provider}</strong> at ${at}.</p><p>If you received this, your email transport is working.</p>`,
      text: `This is a test email from Finlynq. Sent via ${provider} at ${at}.`,
    });
    return { ok: true, provider };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, status: 502, error: sanitizeEmailError(raw, cfg) };
  }
}

export const BAD = Symbol("bad-json");

export function badJson(): NextResponse {
  return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
}

export async function readJson(request: NextRequest): Promise<unknown | typeof BAD> {
  try {
    return await request.json();
  } catch {
    return BAD;
  }
}
