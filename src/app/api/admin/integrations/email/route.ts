/**
 * GET /api/admin/integrations/email — email transport status (admin-only, session-only)
 * POST /api/admin/integrations/email/test — send a test email
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseFromAddress } from "@/lib/email";
import { validateBody } from "@/lib/validate";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;

  // Session-only: reject API-key auth
  if (!auth.context.sessionId) {
    return NextResponse.json(
      { error: "Session required." },
      { status: 403 }
    );
  }

  // Detect which providers are configured
  const brevoConfigured = !!process.env.BREVO_API_KEY;
  const resendConfigured = !!process.env.RESEND_API_KEY;
  const smtpConfigured = !!process.env.SMTP_HOST;

  // Determine active provider (precedence: resend > brevo > smtp > none)
  let activeProvider: "resend" | "brevo" | "smtp" | "none" = "none";
  if (resendConfigured) activeProvider = "resend";
  else if (brevoConfigured) activeProvider = "brevo";
  else if (smtpConfigured) activeProvider = "smtp";

  // Parse from address
  const fromStr = process.env.EMAIL_FROM || "Finlynq <noreply@finlynq.com>";
  const { name, email } = parseFromAddress(fromStr);

  return NextResponse.json({
    provider: activeProvider,
    from: { name: name || "Finlynq", address: email },
    configured: {
      brevo: brevoConfigured,
      resend: resendConfigured,
      smtp: smtpConfigured,
    },
    ...(smtpConfigured && { smtpHost: process.env.SMTP_HOST }),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;

  // Session-only: reject API-key auth
  if (!auth.context.sessionId) {
    return NextResponse.json(
      { error: "Session required." },
      { status: 403 }
    );
  }

  // Parse and validate request body
  const parsed = await validateBody(
    await request.json(),
    z.object({ to: z.string().email() }),
  );
  if (parsed.error) return parsed.error;
  const { to } = parsed.data;

  // Rate limit: 5 per 10 minutes per admin
  const rateLimitKey = `admin-email-test:${auth.context.userId}`;
  const rateLimitData = await getRateLimitData(rateLimitKey);

  if (rateLimitData.count >= 5) {
    return NextResponse.json(
      { error: "Rate limited: 5 test emails per 10 minutes" },
      { status: 429 }
    );
  }

  // Increment rate limit counter
  await incrementRateLimit(rateLimitKey);

  // Determine which provider to use
  let provider: "resend" | "brevo" | "smtp" = "smtp";
  if (process.env.RESEND_API_KEY) provider = "resend";
  else if (process.env.BREVO_API_KEY) provider = "brevo";
  else if (!process.env.SMTP_HOST) {
    return NextResponse.json(
      { ok: false, error: "No email provider configured" },
      { status: 503 }
    );
  }

  // Import sendEmail
  const { sendEmail } = await import("@/lib/email");

  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  try {
    await sendEmail({
      to,
      subject: "Finlynq test email",
      html: `<p>This is a test email from Finlynq.</p>
             <p>Sent via <strong>${provider}</strong> at ${timestamp} UTC.</p>
             <p>If you received this, your email transport is working correctly.</p>`,
      text: `This is a test email from Finlynq. Sent via ${provider} at ${timestamp} UTC.`,
    });

    return NextResponse.json({
      ok: true,
      provider,
      // In a future phase with email logging, include messageId
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    // Sanitize error: remove API keys, credentials, and full HTTP bodies
    const sanitized = sanitizeErrorMessage(errorMessage);
    return NextResponse.json(
      { ok: false, error: sanitized },
      { status: 502 }
    );
  }
}

/**
 * Rate limit helpers (using in-memory storage with process-local tracking).
 * In production, this should use Redis or a proper cache.
 */
const rateLimitStore = new Map<string, { count: number; expiresAt: number }>();

async function getRateLimitData(key: string): Promise<{ count: number }> {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.expiresAt < now) {
    return { count: 0 };
  }

  return { count: entry.count };
}

async function incrementRateLimit(key: string): Promise<void> {
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes
  const entry = rateLimitStore.get(key);

  if (!entry || entry.expiresAt < now) {
    rateLimitStore.set(key, { count: 1, expiresAt });
  } else {
    entry.count++;
    entry.expiresAt = expiresAt;
  }
}

/**
 * Sanitize error messages to prevent leaking API keys, credentials, or full HTTP bodies.
 * Removes common patterns like "xkeysib-...", "re_...", passwords, and long responses.
 */
function sanitizeErrorMessage(message: string): string {
  // Remove API keys and credentials
  let sanitized = message
    .replace(/xkeysib-[a-zA-Z0-9]+/g, "BREVO_API_KEY")
    .replace(/re_[a-zA-Z0-9]+/g, "RESEND_API_KEY")
    .replace(/Bearer\s+[a-zA-Z0-9_-]+/g, "Bearer ***")
    .replace(/api-key[=:]\s*[^\s,}]+/gi, "api-key=***")
    .replace(/password[=:]\s*[^\s,}]+/gi, "password=***")
    .replace(/smtp_pass[=:]\s*[^\s,}]+/gi, "smtp_pass=***");

  // Truncate very long messages (likely HTTP bodies)
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 500) + "...";
  }

  return sanitized;
}
