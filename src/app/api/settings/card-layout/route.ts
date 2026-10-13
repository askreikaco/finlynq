/**
 * Per-page card layout ({ order, hidden } of card ids) for pages with the Customize sheet, e.g. accounts,
 * reports. Query/body `page` picks the page (slug, see PAGE_ID_RE). Stored as JSON in the `settings` table,
 * key `card_layout_v1:<page>`, per user. The client normalises against its own card list (lib/card-layout.ts),
 * so this route only bounds and de-duplicates the ids. The dashboard keeps /api/settings/dashboard-layout.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { requireAuth } from "@/lib/auth/require-auth";
import { db, schema } from "@/db";
import { logApiError, safeErrorMessage, validateBody } from "@/lib/validate";
import { PAGE_ID_RE, cardLayoutKey, type CardLayout } from "@/lib/card-layout";

const putSchema = z.object({
  order: z.array(z.string().max(64)).max(200),
  hidden: z.array(z.string().max(64)).max(200),
});

function sanitize(list: string[]): string[] {
  return [...new Set(list)];
}

function pageParam(request: NextRequest): string | null {
  const page = request.nextUrl.searchParams.get("page") ?? "";
  return PAGE_ID_RE.test(page) ? page : null;
}

async function readLayout(userId: string, page: string): Promise<CardLayout> {
  const row = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(and(eq(schema.settings.key, cardLayoutKey(page)), eq(schema.settings.userId, userId)))
    .limit(1);
  const v = row[0]?.value;
  if (!v) return { order: [], hidden: [] };
  try {
    const obj = JSON.parse(v) as Partial<CardLayout>;
    return {
      order: Array.isArray(obj.order) ? sanitize(obj.order.filter((x): x is string => typeof x === "string")) : [],
      hidden: Array.isArray(obj.hidden) ? sanitize(obj.hidden.filter((x): x is string => typeof x === "string")) : [],
    };
  } catch {
    return { order: [], hidden: [] };
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const page = pageParam(request);
  if (!page) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  return NextResponse.json(await readLayout(auth.context.userId, page));
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;
  const page = pageParam(request);
  if (!page) return NextResponse.json({ error: "Invalid page" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = validateBody(body, putSchema);
  if (parsed.error) return parsed.error;

  const layout: CardLayout = { order: sanitize(parsed.data.order), hidden: sanitize(parsed.data.hidden) };
  try {
    const value = JSON.stringify(layout);
    await db
      .insert(schema.settings)
      .values({ key: cardLayoutKey(page), userId, value })
      .onConflictDoUpdate({
        target: [schema.settings.key, schema.settings.userId],
        set: { value },
      });
    return NextResponse.json(layout);
  } catch (error: unknown) {
    await logApiError("PUT", "/api/settings/card-layout", error, userId);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to save card layout") },
      { status: 500 },
    );
  }
}
