import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { NextResponse } from "next/server";
import { and, eq, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { DASHBOARD_LAYOUT_KEY, DEFAULT_CARD_ORDER } from "@/lib/dashboard-layout";
import { createMockRequest } from "../helpers/api-test-utils";
import { bootstrapFamilyTestDb, shutdownFamilyTestDb } from "../family/family-fixtures";

const state = vi.hoisted(() => ({ userId: "b2-layout-user-a" as string | null }));
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(async () =>
    state.userId
      ? { authenticated: true, context: { userId: state.userId, method: "passphrase", mfaVerified: false, dek: Buffer.alloc(32, 1), sessionId: "s" } }
      : { authenticated: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
  ),
}));

import { GET, PUT } from "@/app/api/settings/dashboard-layout/route";

const PATH = "/api/settings/dashboard-layout";
const put = (body: unknown) => PUT(createMockRequest(PATH, { method: "PUT", body }));
const get = () => GET(createMockRequest(PATH));

async function wipe() {
  await db.delete(schema.settings).where(and(eq(schema.settings.key, DASHBOARD_LAYOUT_KEY), like(schema.settings.userId, "b2-layout-user-%")));
}

// Real Postgres (*_test DB via DATABASE_URL), same harness as the family suites.
beforeAll(bootstrapFamilyTestDb);

beforeEach(async () => {
  state.userId = "b2-layout-user-a";
  await wipe();
});
afterAll(async () => {
  await wipe();
  await shutdownFamilyTestDb();
});

describe("/api/settings/dashboard-layout", () => {
  it("requires auth on GET and PUT (401, nothing written)", async () => {
    state.userId = null;
    expect((await get()).status).toBe(401);
    expect((await put({ order: [], hidden: [] })).status).toBe(401);
    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, DASHBOARD_LAYOUT_KEY));
    expect(rows.filter((r) => r.userId.startsWith("b2-layout-user-"))).toHaveLength(0);
  });

  it("GET for a user with nothing saved returns the defaults (today's order, nothing hidden)", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order: [...DEFAULT_CARD_ORDER], hidden: [] });
  });

  it("PUT persists in the settings table under dashboard_layout_v1 and GET returns it", async () => {
    const order = [...DEFAULT_CARD_ORDER].reverse();
    const res = await put({ order, hidden: ["insights", "quick-import"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order, hidden: ["insights", "quick-import"] });
    const rows = await db.select().from(schema.settings).where(and(eq(schema.settings.key, DASHBOARD_LAYOUT_KEY), eq(schema.settings.userId, "b2-layout-user-a")));
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].value)).toEqual({ order, hidden: ["insights", "quick-import"] });
    expect(await (await get()).json()).toEqual({ order, hidden: ["insights", "quick-import"] });
  });

  it("second PUT overwrites (upsert, one row)", async () => {
    await put({ order: [...DEFAULT_CARD_ORDER], hidden: ["insights"] });
    await put({ order: [...DEFAULT_CARD_ORDER], hidden: [] });
    const rows = await db.select().from(schema.settings).where(and(eq(schema.settings.key, DASHBOARD_LAYOUT_KEY), eq(schema.settings.userId, "b2-layout-user-a")));
    expect(rows).toHaveLength(1);
    expect((await (await get()).json()).hidden).toEqual([]);
  });

  it("drops unknown ids on write and read; missing cards come back at their default position", async () => {
    const res = await put({ order: ["insights", "evil", "net-worth"], hidden: ["evil", "key-metrics"] });
    const body = await res.json();
    expect(body.order).not.toContain("evil");
    expect(body.hidden).toEqual(["key-metrics"]);
    expect(body.order).toHaveLength(DEFAULT_CARD_ORDER.length);
    expect(body.order.indexOf("insights")).toBeLessThan(body.order.indexOf("net-worth"));
    // stored row never holds unknown ids
    const [row] = await db.select().from(schema.settings).where(and(eq(schema.settings.key, DASHBOARD_LAYOUT_KEY), eq(schema.settings.userId, "b2-layout-user-a")));
    expect(row.value).not.toContain("evil");
  });

  it("GET tolerates a stale/corrupt stored value (falls back to defaults / filters unknown ids)", async () => {
    await db.insert(schema.settings).values({ key: DASHBOARD_LAYOUT_KEY, userId: "b2-layout-user-a", value: "{not json" });
    expect(await (await get()).json()).toEqual({ order: [...DEFAULT_CARD_ORDER], hidden: [] });
    await db.update(schema.settings).set({ value: JSON.stringify({ order: ["gone-card", "insights"], hidden: ["gone-card"] }) })
      .where(and(eq(schema.settings.key, DASHBOARD_LAYOUT_KEY), eq(schema.settings.userId, "b2-layout-user-a")));
    const body = await (await get()).json();
    expect(body.order).not.toContain("gone-card");
    expect(body.hidden).toEqual([]);
  });

  it("zod: rejects non-array / missing fields / non-string ids with 400 and writes nothing", async () => {
    for (const bad of [{}, { order: "x", hidden: [] }, { order: [], hidden: "x" }, { order: [1], hidden: [] }, { order: [] }, "str", null]) {
      const res = await put(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    const res = await PUT(new (await import("next/server")).NextRequest(new URL(PATH, "http://localhost:3000"), { method: "PUT", body: "{oops", headers: { "Content-Type": "application/json" } }));
    expect(res.status).toBe(400);
    const rows = await db.select().from(schema.settings).where(and(eq(schema.settings.key, DASHBOARD_LAYOUT_KEY), eq(schema.settings.userId, "b2-layout-user-a")));
    expect(rows).toHaveLength(0);
  });

  it("is per user", async () => {
    await put({ order: [...DEFAULT_CARD_ORDER], hidden: ["insights"] });
    state.userId = "b2-layout-user-b";
    expect(await (await get()).json()).toEqual({ order: [...DEFAULT_CARD_ORDER], hidden: [] });
    await put({ order: [...DEFAULT_CARD_ORDER], hidden: ["key-metrics"] });
    state.userId = "b2-layout-user-a";
    expect((await (await get()).json()).hidden).toEqual(["insights"]);
  });
});
