/**
 * GET /api/settings/passkeys — list the signed-in user's passkeys.
 * Web session only (method "account"). Never returns public keys, counters or
 * key wraps.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDialect } from "@/db";
import { requireWebSession } from "@/lib/auth/web-session";
import { listPasskeys } from "@/lib/auth/queries";
import { logApiError } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json({ error: "Passkeys are only available in managed mode." }, { status: 403 });
  }
  const auth = await requireWebSession(request);
  if (!auth.ok) return auth.response;
  try {
    const rows = await listPasskeys(auth.context.userId);
    const passkeys = rows
      .map((r) => ({
        id: r.id,
        label: r.label,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        backedUp: Boolean(r.backedUp),
        prfSupported: Boolean(r.prfSupported),
        transports: r.transports ? safeJson(r.transports) : [],
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return NextResponse.json({ passkeys }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await logApiError("GET", "/api/settings/passkeys", e);
    return NextResponse.json({ error: "Failed to list passkeys." }, { status: 500 });
  }
}

function safeJson(s: string): unknown[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
