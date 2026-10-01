/**
 * Dashboard card layout preferences (order and visibility). Stored as JSON in
 * settings key-value store per user. Includes card order array and hidden array.
 * Unknown/new card IDs are appended to the default position.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { requireAuth } from "@/lib/auth/require-auth";
import { db, schema } from "@/db";
import { logApiError, safeErrorMessage, validateBody } from "@/lib/validate";

const DASHBOARD_LAYOUT_KEY = "dashboard_layout_v1";

// Default card order and visibility
const DEFAULT_CARD_ORDER = [
  "net-worth",
  "health-score",
  "this-month",
  "budget-progress",
  "recent-transactions",
  "action-center",
  "insights",
  "income-expense-chart",
  "spending-category-chart",
  "weekly-recap",
  "available-to-spend",
  "quick-import",
  "key-metrics",
  "tips",
];

const DEFAULT_HIDDEN: string[] = [];

const putSchema = z.object({
  order: z.array(z.string()),
  hidden: z.array(z.string()),
});

interface DashboardLayout {
  order: string[];
  hidden: string[];
}

async function readLayout(userId: string): Promise<DashboardLayout> {
  const row = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(
      and(
        eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
        eq(schema.settings.userId, userId)
      )
    )
    .limit(1);

  if (!row[0]) {
    return {
      order: DEFAULT_CARD_ORDER,
      hidden: DEFAULT_HIDDEN,
    };
  }

  try {
    const parsed = JSON.parse(row[0].value) as DashboardLayout;
    // Validate structure and filter unknown card ids
    const validIds = new Set([...DEFAULT_CARD_ORDER]);
    return {
      order: (parsed.order ?? []).filter((id) => validIds.has(id)),
      hidden: (parsed.hidden ?? []).filter((id) => validIds.has(id)),
    };
  } catch {
    return {
      order: DEFAULT_CARD_ORDER,
      hidden: DEFAULT_HIDDEN,
    };
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const layout = await readLayout(auth.context.userId);
  return NextResponse.json(layout);
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

  try {
    // Filter unknown card ids before saving
    const validIds = new Set(DEFAULT_CARD_ORDER);
    const filteredLayout: DashboardLayout = {
      order: parsed.data.order.filter((id) => validIds.has(id)),
      hidden: parsed.data.hidden.filter((id) => validIds.has(id)),
    };

    await db
      .insert(schema.settings)
      .values({
        key: DASHBOARD_LAYOUT_KEY,
        userId,
        value: JSON.stringify(filteredLayout),
      })
      .onConflictDoUpdate({
        target: [schema.settings.key, schema.settings.userId],
        set: { value: JSON.stringify(filteredLayout) },
      });

    return NextResponse.json(filteredLayout);
  } catch (error: unknown) {
    await logApiError(
      "PUT",
      "/api/settings/dashboard-layout",
      error,
      userId
    );
    return NextResponse.json(
      {
        error: safeErrorMessage(error, "Failed to save dashboard layout"),
      },
      { status: 500 }
    );
  }
}
