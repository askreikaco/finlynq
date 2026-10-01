/**
 * PATCH  /api/settings/passkeys/[id] — rename (web session; ownership enforced).
 * DELETE /api/settings/passkeys/[id] — remove (web session + step-up).
 *
 * A passkey that belongs to another account is indistinguishable from a
 * missing one (404). Deleting a passkey never touches other accounts' rows
 * (userId-scoped DELETE ... RETURNING).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireWebSession, enforcePasswordStepUp } from "@/lib/auth/web-session";
import { getPasskey, getUserById, deletePasskey, renamePasskey, countPasskeys } from "@/lib/auth/queries";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { clientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => NextResponse.json({ error: "Passkey not found." }, { status: 404 });
const idSchema = z.string().min(1).max(1024);

const renameSchema = z.object({ label: z.string().trim().min(1).max(60) });
const deleteSchema = z.object({ currentPassword: z.string().min(1).max(256).optional() });

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  const auth = await requireWebSession(request);
  if (!auth.ok) return auth.response;
  const { userId } = auth.context;
  try {
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return NOT_FOUND();
    const parsed = validateBody(await request.json().catch(() => null), renameSchema);
    if (parsed.error) return parsed.error;
    const row = await getPasskey(id.data);
    if (!row || row.userId !== userId) return NOT_FOUND();
    if (!(await renamePasskey(userId, id.data, parsed.data.label))) return NOT_FOUND();
    logSecurityEvent(userId, "passkey_renamed", {
      method: "passkey",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
    return NextResponse.json({ success: true, label: parsed.data.label });
  } catch (e) {
    await logApiError("PATCH", "/api/settings/passkeys/[id]", e);
    return NextResponse.json({ error: "Failed to rename passkey." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  const auth = await requireWebSession(request);
  if (!auth.ok) return auth.response;
  const { userId, iat } = auth.context;
  const rl = checkRateLimit(`passkey-delete:${userId}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }
  try {
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return NOT_FOUND();
    const parsed = validateBody(await request.json().catch(() => ({})), deleteSchema);
    if (parsed.error) return parsed.error;

    // Ownership first: a foreign id is a plain 404 (never reaches step-up or DELETE).
    const row = await getPasskey(id.data);
    if (!row || row.userId !== userId) return NOT_FOUND();

    const user = await getUserById(userId);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const denied = await enforcePasswordStepUp({
      request,
      userId,
      iat,
      passwordHash: user.passwordHash as string,
      currentPassword: parsed.data.currentPassword,
      label: "passkey-stepup",
    });
    if (denied) return denied;

    if (!(await deletePasskey(userId, id.data))) return NOT_FOUND();
    logSecurityEvent(userId, "passkey_removed", {
      method: "passkey",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    }).catch(() => {});

    // Warn only: removing the last second factor leaves the account on password alone.
    const remaining = await countPasskeys(userId);
    const warning =
      remaining === 0 && !(user.mfaEnabled && user.mfaSecret)
        ? "No two-factor method remains on this account."
        : undefined;
    return NextResponse.json({ success: true, ...(warning ? { warning } : {}) });
  } catch (e) {
    await logApiError("DELETE", "/api/settings/passkeys/[id]", e);
    return NextResponse.json({ error: "Failed to delete passkey." }, { status: 500 });
  }
}
