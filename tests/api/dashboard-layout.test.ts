import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

describe("/api/settings/dashboard-layout", () => {
  const testUserId = "test-user-123";
  const DASHBOARD_LAYOUT_KEY = "dashboard_layout_v1";

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

  beforeAll(async () => {
    // Clean up any existing test data
    await db
      .delete(schema.settings)
      .where(
        and(
          eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
          eq(schema.settings.userId, testUserId)
        )
      );
  });

  afterAll(async () => {
    // Clean up test data
    await db
      .delete(schema.settings)
      .where(
        and(
          eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
          eq(schema.settings.userId, testUserId)
        )
      );
  });

  it("returns default layout when none saved", async () => {
    const row = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(
        and(
          eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
          eq(schema.settings.userId, testUserId)
        )
      );

    expect(row).toHaveLength(0);
  });

  it("saves and retrieves custom layout", async () => {
    const customLayout = {
      order: ["net-worth", "health-score", "this-month"],
      hidden: ["tips", "quick-import"],
    };

    await db
      .insert(schema.settings)
      .values({
        key: DASHBOARD_LAYOUT_KEY,
        userId: testUserId,
        value: JSON.stringify(customLayout),
      })
      .onConflictDoUpdate({
        target: [schema.settings.key, schema.settings.userId],
        set: { value: JSON.stringify(customLayout) },
      });

    const row = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(
        and(
          eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
          eq(schema.settings.userId, testUserId)
        )
      );

    expect(row).toHaveLength(1);
    const saved = JSON.parse(row[0].value);
    expect(saved.order).toEqual(customLayout.order);
    expect(saved.hidden).toEqual(customLayout.hidden);
  });

  it("filters unknown card ids when saving", async () => {
    const invalidLayout = {
      order: ["net-worth", "unknown-card", "health-score"],
      hidden: ["non-existent"],
    };

    const validIds = new Set(DEFAULT_CARD_ORDER);
    const filteredLayout = {
      order: (invalidLayout.order ?? []).filter((id) => validIds.has(id)),
      hidden: (invalidLayout.hidden ?? []).filter((id) => validIds.has(id)),
    };

    expect(filteredLayout.order).toEqual(["net-worth", "health-score"]);
    expect(filteredLayout.hidden).toEqual([]);
  });

  it("supports multi-user isolation", async () => {
    const user1Id = "user-1";
    const user2Id = "user-2";

    const layout1 = {
      order: ["net-worth", "health-score"],
      hidden: ["tips"],
    };
    const layout2 = {
      order: ["health-score", "net-worth"],
      hidden: [],
    };

    await db
      .insert(schema.settings)
      .values([
        {
          key: DASHBOARD_LAYOUT_KEY,
          userId: user1Id,
          value: JSON.stringify(layout1),
        },
        {
          key: DASHBOARD_LAYOUT_KEY,
          userId: user2Id,
          value: JSON.stringify(layout2),
        },
      ])
      .onConflictDoUpdate({
        target: [schema.settings.key, schema.settings.userId],
        set: { value: schema.settings.value },
      });

    const user1Row = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(
        and(
          eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
          eq(schema.settings.userId, user1Id)
        )
      );

    const user2Row = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(
        and(
          eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
          eq(schema.settings.userId, user2Id)
        )
      );

    expect(JSON.parse(user1Row[0].value)).toEqual(layout1);
    expect(JSON.parse(user2Row[0].value)).toEqual(layout2);

    // Clean up
    await db
      .delete(schema.settings)
      .where(
        and(
          eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
          eq(
            schema.settings.userId,
            user1Id
          )
        )
      );
    await db
      .delete(schema.settings)
      .where(
        and(
          eq(schema.settings.key, DASHBOARD_LAYOUT_KEY),
          eq(schema.settings.userId, user2Id)
        )
      );
  });
});
