/**
 * Dashboard card layout ({ order, hidden } of card ids). Stored as JSON in the
 * `settings` key-value table (key `dashboard_layout_v1`, per user) — no migration.
 * Mirrors /api/settings/language: `requireAuth`, zod-validated PUT, upsert on
 * (key, user_id). Unknown card ids are dropped; a user with nothing saved gets the
 * default layout (today's dashboard order, nothing hidden).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { requireAuth } from "@/lib/auth/require-auth";
import { db, schema } from "@/db";
import { logApiError, safeErrorMessage, validateBody } from "@/lib/validate";
import { DASHBOARD_LAYOUT_KEY as KEY, defaultLayout, normalizeLayout, type DashboardLayout } from "@/lib/dashboard-layout";

// Ids are checked against the registry in normalizeLayout (unknown → dropped, not rejected,
// so an older client never fails a save after a card is renamed/removed).
const putSchema = z.object({
  order: z.array(z.string().max(64)).max(200),
  hidden: z.array(z.string().max(64)).max(200),
});

async function readLayout(userId: string): Promise<DashboardLayout> {
  const row = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(and(eq(schema.settings.key, KEY), eq(schema.settings.userId, userId)))
    .limit(1);
  const v = row[0]?.value;
  if (!v) return defaultLayout();
  try {
    return normalizeLayout(JSON.parse(v));
  } catch {
    return defaultLayout();
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  return NextResponse.json(await readLayout(auth.context.userId));
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = validateBody(body, putSchema);
  if (parsed.error) return parsed.error;

  const layout = normalizeLayout(parsed.data);
  try {
    const value = JSON.stringify(layout);
    await db
      .insert(schema.settings)
      .values({ key: KEY, userId, value })
      .onConflictDoUpdate({
        target: [schema.settings.key, schema.settings.userId],
        set: { value },
      });
    return NextResponse.json(layout);
  } catch (error: unknown) {
    await logApiError("PUT", "/api/settings/dashboard-layout", error, userId);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to save dashboard layout") },
      { status: 500 },
    );
  }
}
