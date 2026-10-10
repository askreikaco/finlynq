// @vitest-environment node
/**
 * Repeat + Installment phase 2a: POST /api/transactions { subscriptionId, occurrenceDate }.
 * In-memory fakes; withDbTransaction simulates commit/rollback over the store.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableName } from "drizzle-orm";
import { createMockRequest, parseResponse, TEST_DEK } from "../helpers/api-test-utils";

// ─── in-memory store + fakes ────────────────────────────────────────────────
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  store: { tx: [] as Row[], subs: [] as Row[] },
  sub: null as Row | null,
  subOwner: "u1",
  updateMatches: true,
  insertError: null as unknown,
  failAtCall: 0,
  createCalls: 0,
  authDek: null as Buffer | null,
  existingSub: null as Row | null,
  seedRow: null as Row | null,
  laterRows: [] as Row[],
  whereLog: [] as Array<{ table: string; cond: unknown; kind: string }>,
  cascadeIds: [] as number[][],
  subInsertError: null as unknown,
}));

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(async () => ({
    authenticated: true,
    context: { userId: "u1", method: "passphrase" as const, mfaVerified: false, dek: h.authDek, sessionId: h.authDek ? "sess" : null },
  })),
}));

vi.mock("@/lib/queries", () => ({
  getTransactions: vi.fn(),
  getTransactionCount: vi.fn(),
  getTransactionsPage: vi.fn(),
  updateTransaction: vi.fn(),
  getAccountById: vi.fn(async (id: number) => ({ id, currency: "USD" })),
  createTransaction: vi.fn(async (_userId: string, data: Row) => {
    h.createCalls++;
    if (h.failAtCall && h.createCalls === h.failAtCall) throw new Error("boom on row " + h.createCalls);
    if (h.insertError) throw h.insertError;
    const row = { id: 100 + h.store.tx.length + 1, ...data };
    h.store.tx.push(row);
    return row;
  }),
}));

vi.mock("@/lib/currency-conversion", () => ({
  convertToAccountCurrency: vi.fn(async (a: { enteredAmount: number; enteredCurrency: string; accountCurrency: string }) => ({
    amount: a.enteredCurrency === a.accountCurrency ? a.enteredAmount : a.enteredAmount * 2,
    enteredFxRate: a.enteredCurrency === a.accountCurrency ? 1 : 2,
    source: "test",
  })),
}));

vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema-pg")>("@/db/schema-pg");
  const chain = (table: { v: unknown }) => {
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => { table.v = t; return b; };
    b.where = (cond: unknown) => { h.whereLog.push({ table: getTableName(table.v as never), cond, kind: "where" }); return b; };
    b.get = async () =>
      getTableName(table.v as never) === "subscriptions"
        ? h.sub && h.subOwner === "u1" ? h.sub : undefined
        : h.seedRow;
    b.all = async () => h.laterRows;
    return b;
  };
  return {
    schema,
    db: {
      select: () => chain({ v: null }),
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
      insert: (t: unknown) => ({
        values: (v: Row) => ({
          returning: () => ({
            get: async () => {
              if (h.subInsertError) throw h.subInsertError;
              if (getTableName(t as never) === "subscriptions") {
                const row = { id: 900 + h.store.subs.length + 1, ...v };
                h.store.subs.push(row);
                return row;
              }
              return v;
            },
          }),
        }),
      }),
    },
    withDbTransaction: async <T,>(fn: () => Promise<T>): Promise<T> => {
      const snap = { tx: [...h.store.tx], subs: [...h.store.subs], sub: h.sub };
      try {
        return await fn();
      } catch (e) {
        h.store.tx = snap.tx;
        h.store.subs = snap.subs;
        h.sub = snap.sub;
        throw e;
      }
    },
  };
});

vi.mock("@/lib/data-version", () => ({
  incrementDataVersion: vi.fn(async () => undefined),
  checkETag: vi.fn(),
  withEtagHeaders: vi.fn(),
}));
vi.mock("@/lib/verify-ownership", () => ({
  verifyOwnership: vi.fn(async () => undefined),
  OwnershipError: class OwnershipError extends Error {},
}));
vi.mock("@/lib/mcp/user-tx-cache", () => ({ invalidateUser: vi.fn() }));
vi.mock("@/lib/portfolio/snapshots/dirty", () => ({ markSnapshotsDirty: vi.fn(async () => undefined) }));
const markCash = vi.fn(async () => undefined);
vi.mock("@/lib/portfolio/snapshots/cash-dirty", () => ({ markCashSnapshotsDirty: (...a: unknown[]) => (markCash as (...x: unknown[]) => unknown)(...a) }));
vi.mock("@/lib/portfolio/lots/write-hooks", () => ({
  applyLotEffectsForTx: vi.fn(),
  buildLotContext: vi.fn(),
  reverseLotsForDeleteHook: vi.fn(),
  replanLotsAfterMutation: vi.fn(),
}));
vi.mock("@/lib/portfolio/operations", () => ({ canEditPortfolioRow: vi.fn() }));
vi.mock("@/lib/external-import/portfolio-holding-resolver", () => ({ buildHoldingResolver: vi.fn() }));
vi.mock("@/lib/securities/flag", () => ({ securitiesReadEnabledForUser: vi.fn() }));
vi.mock("@/lib/transactions/text-filter", () => ({
  resolveTextFilterIds: vi.fn(),
  resolveAccountTextIds: vi.fn(),
  resolveHoldingTextIds: vi.fn(),
}));
vi.mock("@/lib/transactions/sign-category-invariant", () => ({ validateSignVsCategoryById: vi.fn(async () => null) }));
vi.mock("@/lib/server-logger", () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock("@/lib/transactions/delete-cascade", () => ({
  deleteTransactionsCascade: vi.fn(async (_u: string, ids: number[]) => {
    h.cascadeIds.push(ids);
    return { ok: true as const, deletedIds: ids, cascaded: false, reallocated: [] };
  }),
}));

import { POST as postTx } from "@/app/api/transactions/route";
import { createTransaction } from "@/lib/queries";

const URL_TX = "http://localhost:3000/api/transactions";
const base = {
  date: "2026-03-12",
  accountId: 1,
  categoryId: 2,
  payee: "Gym",
  enteredCurrency: "USD",
  enteredAmount: -40,
};
const mkSub = (over: Row = {}): Row => ({
  id: 7, userId: "u1", status: "active", frequency: "monthly", nextDate: "2026-03-10",
  endDate: null, remainingCount: null, ...over,
});
const post = (extra: Row = {}) =>
  postTx(createMockRequest(URL_TX, { method: "POST", body: { ...base, subscriptionId: 7, occurrenceDate: "2026-03-10", ...extra } }));
const dupErr = () => Object.assign(new Error("dup"), { code: "23505", constraint: "uniq_transactions_subscription_occurrence" });

beforeEach(() => {
  h.store = { tx: [], subs: [] };
  h.failAtCall = 0;
  h.createCalls = 0;
  h.authDek = TEST_DEK;
  h.existingSub = null;
  h.seedRow = null;
  h.laterRows = [];
  h.whereLog = [];
  h.cascadeIds = [];
  h.subInsertError = null;
  h.sub = mkSub();
  h.subOwner = "u1";
  h.updateMatches = true;
  h.insertError = null;
  vi.mocked(createTransaction).mockClear();
});

describe("POST /api/transactions { subscriptionId, occurrenceDate }", () => {
  it("posts the due occurrence at the body date/amount and advances the subscription in the same call", async () => {
    const { status, data } = await parseResponse(await post());
    expect(status).toBe(201);
    expect(h.store.tx).toHaveLength(1);
    expect(h.store.tx[0]).toMatchObject({ subscriptionId: 7, occurrenceDate: "2026-03-10", date: "2026-03-12", amount: -40, source: "manual" });
    expect(h.sub).toMatchObject({ nextDate: "2026-04-10", status: "active", remainingCount: null });
    expect((data as { subscription: unknown }).subscription).toEqual({ id: 7, nextDate: "2026-04-10", remainingCount: null, status: "active" });
  });

  it("decrements remaining_count and marks the subscription ended on the last occurrence", async () => {
    h.sub = mkSub({ remainingCount: 2 });
    expect((await post()).status).toBe(201);
    expect(h.sub).toMatchObject({ nextDate: "2026-04-10", remainingCount: 1, status: "active" });
    h.store.tx = [];
    expect((await post({ occurrenceDate: "2026-04-10" })).status).toBe(201);
    expect(h.sub).toMatchObject({ remainingCount: 0, status: "ended", nextDate: "2026-04-10" });
  });

  it("ends when the following occurrence would fall after end_date", async () => {
    h.sub = mkSub({ endDate: "2026-04-05" });
    expect((await post()).status).toBe(201);
    expect(h.sub).toMatchObject({ status: "ended" });
  });

  it("409 occurrence_not_due when the date is not the current next_date; nothing written", async () => {
    const { status, data } = await parseResponse(await post({ occurrenceDate: "2026-03-11" }));
    expect(status).toBe(409);
    expect((data as { code: string }).code).toBe("occurrence_not_due");
    expect(h.store.tx).toHaveLength(0);
    expect(h.sub).toMatchObject({ nextDate: "2026-03-10" });
  });

  it("409 subscription_not_active for a paused subscription", async () => {
    h.sub = mkSub({ status: "paused" });
    const { status, data } = await parseResponse(await post());
    expect(status).toBe(409);
    expect((data as { code: string }).code).toBe("subscription_not_active");
  });

  it("404 for another user's subscription", async () => {
    h.subOwner = "someone-else";
    const res = await post();
    expect(res.status).toBe(404);
    expect(h.store.tx).toHaveLength(0);
  });

  it("409 already_posted when the unique (subscription, occurrence) index fires; subscription untouched", async () => {
    h.insertError = dupErr();
    const { status, data } = await parseResponse(await post());
    expect(status).toBe(409);
    expect((data as { code: string }).code).toBe("already_posted");
    expect(h.sub).toMatchObject({ nextDate: "2026-03-10" });
  });

  it("is atomic: a lost race on the conditional UPDATE rolls the inserted row back (409)", async () => {
    h.updateMatches = false;
    const { status, data } = await parseResponse(await post());
    expect(status).toBe(409);
    expect((data as { code: string }).code).toBe("occurrence_not_due");
    expect(h.store.tx).toHaveLength(0);
  });

  it("is atomic: an insert failure leaves the subscription unchanged", async () => {
    h.failAtCall = 1;
    expect((await post()).status).toBe(500);
    expect(h.sub).toMatchObject({ nextDate: "2026-03-10", status: "active" });
  });

  it("400 when only one of subscriptionId/occurrenceDate is sent, or combined with repeat", async () => {
    for (const body of [
      { ...base, subscriptionId: 7 },
      { ...base, occurrenceDate: "2026-03-10" },
      { ...base, subscriptionId: 7, occurrenceDate: "2026-03-10", repeat: { frequency: "monthly" } },
    ]) {
      const { status, data } = await parseResponse(await postTx(createMockRequest(URL_TX, { method: "POST", body })));
      expect(status).toBe(400);
      expect((data as { code: string }).code).toBe("invalid_request");
    }
    expect(h.store.tx).toHaveLength(0);
  });

  it("a plain POST (and the Repeat creation row) never sets occurrence_date", async () => {
    expect((await postTx(createMockRequest(URL_TX, { method: "POST", body: base }))).status).toBe(201);
    expect(h.store.tx[0].occurrenceDate).toBeUndefined();
    expect(h.sub).toMatchObject({ nextDate: "2026-03-10" });
  });
});
