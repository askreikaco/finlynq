// @vitest-environment node
/**
 * Phase 2a: GET /api/subscriptions (postable / overdue / dueCount) and
 * POST /api/subscriptions { action: "skip" }. In-memory db fake.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, parseResponse, TEST_DEK } from "../helpers/api-test-utils";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  subsRows: [] as Row[],
  linked: [] as Row[],
  sub: null as Row | null,
  owner: "u1",
  updateMatches: true,
}));

vi.mock("@/lib/utils/date", () => ({ todayISO: () => "2026-06-15" }));
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(async () => ({
    authenticated: true,
    context: { userId: "u1", method: "passphrase" as const, mfaVerified: false, dek: TEST_DEK, sessionId: "s" },
  })),
}));
vi.mock("@/lib/auth/require-encryption", () => ({
  requireEncryption: vi.fn(async () => ({ ok: true, userId: "u1", dek: TEST_DEK, sessionId: "s" })),
}));
vi.mock("@/lib/fx-service", () => ({
  getDisplayCurrency: vi.fn(async () => "USD"),
  getRateMap: vi.fn(async () => new Map()),
  convertWithRateMap: vi.fn((a: number) => a),
}));
vi.mock("@/lib/verify-ownership", () => ({
  verifyOwnership: vi.fn(async () => undefined),
  OwnershipError: class OwnershipError extends Error {},
}));
vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema-pg")>("@/db/schema-pg");
  const select = (kind: "subs" | "linked" | "sub") => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "leftJoin", "where", "orderBy"]) b[m] = () => b;
    b.all = async () => (kind === "linked" ? h.linked : h.subsRows);
    b.get = async () => (h.sub && h.owner === "u1" ? h.sub : undefined);
    return b;
  };
  return {
    schema,
    db: {
      execute: async () => [],
      select: (cols?: Record<string, unknown>) => select(cols && "nameCt" in cols ? "subs" : "sub"),
      selectDistinct: () => select("linked"),
      update: () => {
        let patch: Row = {};
        const b: Record<string, unknown> = {};
        b.set = (v: Row) => { patch = v; return b; };
        b.where = () => b;
        b.returning = () => b;
        b.get = async () => {
          if (!h.updateMatches || !h.sub) return undefined;
          h.sub = { ...h.sub, ...patch };
          return { id: h.sub.id };
        };
        return b;
      },
    },
    withDbTransaction: async <T,>(fn: () => Promise<T>): Promise<T> => fn(),
  };
});

import { GET, POST } from "@/app/api/subscriptions/route";

const URL = "http://localhost:3000/api/subscriptions";
const row = (over: Row): Row => ({
  id: 1, nameCt: null, amount: 10, currency: "USD", frequency: "monthly", categoryId: null, categoryNameCt: null,
  accountId: null, accountNameCt: null, nextDate: "2026-07-10", status: "active", cancelReminderDate: null,
  notes: null, endDate: null, remainingCount: null, ...over,
});

beforeEach(() => {
  h.subsRows = [];
  h.linked = [];
  h.owner = "u1";
  h.updateMatches = true;
  h.sub = { id: 7, userId: "u1", status: "active", frequency: "monthly", nextDate: "2026-06-10", endDate: null, remainingCount: null };
});

describe("GET /api/subscriptions - postable / overdue / dueCount", () => {
  it("flags postable subs and lists due occurrences", async () => {
    h.subsRows = [
      row({ id: 1, nextDate: "2026-04-10" }),
      row({ id: 2, nextDate: "2026-07-10" }),
      row({ id: 3, nextDate: "2026-04-10", status: "paused" }),
    ];
    h.linked = [{ subscriptionId: 1 }];
    const { status, data } = await parseResponse(await GET(createMockRequest(URL)));
    expect(status).toBe(200);
    const byId = Object.fromEntries((data as Row[]).map((r) => [r.id as number, r]));
    expect(byId[1]).toMatchObject({ postable: true, dueCount: 3, overdue: ["2026-04-10", "2026-05-10", "2026-06-10"] });
    expect(byId[2]).toMatchObject({ postable: false, dueCount: 0, overdue: [] });
    expect(byId[3]).toMatchObject({ dueCount: 0, overdue: [] }); // paused: nothing due
  });

  it("caps overdue at 12 but reports the full dueCount", async () => {
    h.subsRows = [row({ id: 1, nextDate: "2025-01-01", frequency: "weekly" })];
    h.linked = [{ subscriptionId: 1 }];
    const { data } = await parseResponse(await GET(createMockRequest(URL)));
    const r = (data as Row[])[0];
    expect((r.overdue as string[]).length).toBe(12);
    expect(r.dueCount as number).toBeGreaterThan(60);
  });

  it("honours end conditions when counting what is due", async () => {
    h.subsRows = [row({ id: 1, nextDate: "2026-03-10", remainingCount: 2 })];
    const { data } = await parseResponse(await GET(createMockRequest(URL)));
    expect((data as Row[])[0]).toMatchObject({ dueCount: 2, overdue: ["2026-03-10", "2026-04-10"] });
  });
});

describe("POST /api/subscriptions { action: 'skip' }", () => {
  const skip = (extra: Row = {}) =>
    POST(createMockRequest(URL, { method: "POST", body: { action: "skip", id: 7, occurrenceDate: "2026-06-10", ...extra } }));

  it("advances one occurrence without touching transactions", async () => {
    const { status, data } = await parseResponse(await skip());
    expect(status).toBe(200);
    expect(data).toMatchObject({ success: true, subscription: { id: 7, nextDate: "2026-07-10", status: "active" } });
    expect(h.sub).toMatchObject({ nextDate: "2026-07-10" });
  });

  it("marks the subscription ended when the skipped occurrence was the last", async () => {
    h.sub = { ...h.sub!, remainingCount: 1 };
    const { data } = await parseResponse(await skip());
    expect(data).toMatchObject({ subscription: { status: "ended", remainingCount: 0 } });
    expect(h.sub).toMatchObject({ status: "ended" });
  });

  it("409 occurrence_not_due for any other date", async () => {
    const { status, data } = await parseResponse(await skip({ occurrenceDate: "2026-06-11" }));
    expect(status).toBe(409);
    expect((data as { code: string }).code).toBe("occurrence_not_due");
    expect(h.sub).toMatchObject({ nextDate: "2026-06-10" });
  });

  it("409 for a paused subscription; 404 for someone else's", async () => {
    h.sub = { ...h.sub!, status: "paused" };
    expect((await skip()).status).toBe(409);
    h.sub = { ...h.sub!, status: "active" };
    h.owner = "other";
    expect((await skip()).status).toBe(404);
  });

  it("409 when a concurrent post already moved next_date (conditional UPDATE matched nothing)", async () => {
    h.updateMatches = false;
    expect((await skip()).status).toBe(409);
  });

  it("400 for a malformed body", async () => {
    expect((await skip({ occurrenceDate: "tomorrow" })).status).toBe(400);
    expect((await skip({ id: 0 })).status).toBe(400);
  });
});
