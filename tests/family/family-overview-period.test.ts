/** GET /api/family/overview period param: month (default) / year / all, legacy 6m / 1y still accepted. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ periods: [] as string[] }));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => ({
    authenticated: true,
    context: { userId: "u-period", method: "account", mfaVerified: true, dek: null, sessionId: "s" },
  }),
}));
vi.mock("@/lib/family/overview/gate", () => ({ viewerPassesMfaGate: async () => true }));
vi.mock("@/lib/fx-service", () => ({ getDisplayCurrency: async () => "USD" }));
vi.mock("@/lib/family/share-dal", () => ({ updateLastViewed: async () => undefined }));
vi.mock("@/lib/family/overview/assemble", () => ({
  assembleFamilyOverview: async (input: { period: string }) => {
    h.periods.push(input.period);
    return { members: [], partial: false };
  },
}));
vi.mock("@/db", () => {
  const chain = { select: () => chain, from: () => chain, where: async () => [] };
  return { db: chain };
});

import { GET } from "@/app/api/family/overview/route";

const get = (qs = "") => GET(new NextRequest(`http://localhost/api/family/overview${qs}`, { method: "GET" }));

beforeEach(() => {
  h.periods.length = 0;
});

describe("overview period", () => {
  it("defaults to month (this month)", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect((await r.json()).period).toBe("month");
    expect(h.periods).toEqual(["month"]);
  });

  for (const p of ["month", "year", "all", "6m", "1y"]) {
    it(`accepts period=${p}`, async () => {
      const r = await get(`?period=${p}`);
      expect(r.status).toBe(200);
      expect((await r.json()).period).toBe(p);
      expect(h.periods).toEqual([p]);
    });
  }

  it("rejects an unknown period with 400 before building anything", async () => {
    const r = await get("?period=5y");
    expect(r.status).toBe(400);
    expect(h.periods).toEqual([]);
  });
});
