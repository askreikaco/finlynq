// @vitest-environment node
/**
 * Repeat + Installment phase 1 (R2): POST /api/transactions/installments,
 * POST /api/transactions { repeat }, DELETE /api/transactions?scope=following.
 *
 * The DB is faked in memory. `withDbTransaction` is simulated with real
 * commit/rollback semantics over that store, so "all or none" is asserted on
 * what is left in the store after a mid-batch failure. The SQL predicates of
 * the scope=following lookup are asserted by rendering the drizzle condition.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import { NextResponse } from "next/server";
import { decryptField } from "@/lib/crypto/envelope";
import { nameLookup } from "@/lib/crypto/encrypted-columns";
import { createMockRequest, parseResponse, TEST_DEK } from "../helpers/api-test-utils";

// ─── in-memory store + fakes ────────────────────────────────────────────────
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  store: { tx: [] as Row[], subs: [] as Row[] },
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
    b.get = async () => (getTableName(table.v as never) === "subscriptions" ? h.existingSub : h.seedRow);
    b.all = async () => h.laterRows;
    return b;
  };
  return {
    schema,
    db: {
      select: () => chain({ v: null }),
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
      const snap = { tx: [...h.store.tx], subs: [...h.store.subs] };
      try {
        return await fn();
      } catch (e) {
        h.store.tx = snap.tx;
        h.store.subs = snap.subs;
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

import { POST as postInstallments } from "@/app/api/transactions/installments/route";
import { POST as postTx, DELETE as deleteTx } from "@/app/api/transactions/route";
import { requireAuth } from "@/lib/auth/require-auth";
import { createTransaction } from "@/lib/queries";
import { deleteTransactionsCascade } from "@/lib/transactions/delete-cascade";

const URL_INST = "http://localhost:3000/api/transactions/installments";
const URL_TX = "http://localhost:3000/api/transactions";
const baseInst = {
  date: "2026-01-31",
  accountId: 1,
  categoryId: 2,
  payee: "Laptop shop",
  note: "MacBook",
  enteredCurrency: "USD",
  enteredAmount: -500,
  count: 6,
  mode: "split" as const,
};

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
  markCash.mockClear();
  vi.mocked(createTransaction).mockClear();
  vi.mocked(deleteTransactionsCascade).mockClear();
});

describe("POST /api/transactions/installments", () => {
  it("inserts N rows with a server group id, seq 1..N, note suffix and signed split amounts", async () => {
    const res = await postInstallments(createMockRequest(URL_INST, { method: "POST", body: baseInst }));
    const { status, data } = await parseResponse(res);
    const body = data as { installmentGroupId: string; count: number; ids: number[] };
    expect(status).toBe(201);
    expect(body.count).toBe(6);
    expect(body.ids).toHaveLength(6);
    expect(body.installmentGroupId).toMatch(/^[0-9a-f-]{36}$/);

    expect(h.store.tx).toHaveLength(6);
    expect(h.store.tx.map((r) => r.installmentSeq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(h.store.tx.map((r) => r.installmentGroupId))).toEqual(new Set([body.installmentGroupId]));
    expect(h.store.tx.map((r) => r.date)).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30",
    ]);
    const amounts = h.store.tx.map((r) => r.amount as number);
    expect(amounts).toEqual([-83.33, -83.33, -83.33, -83.33, -83.33, -83.35]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(-500, 10);
    // note suffix, payee/note encrypted with the user's DEK
    const notes = h.store.tx.map((r) => decryptField(TEST_DEK, r.note as string));
    expect(notes).toEqual(["MacBook 1/6", "MacBook 2/6", "MacBook 3/6", "MacBook 4/6", "MacBook 5/6", "MacBook 6/6"]);
    expect(String(h.store.tx[0].note).startsWith("v1:")).toBe(true);
    expect(decryptField(TEST_DEK, h.store.tx[0].payee as string)).toBe("Laptop shop");
    expect(h.store.tx[0].source).toBe("manual");
    expect(h.store.tx[0].enteredCurrency).toBe("USD");
    expect(markCash).toHaveBeenCalledWith("u1", 1, "2026-01-31");
  });

  it("income (positive) keeps its sign; mode each repeats the amount; empty note becomes just the suffix", async () => {
    const res = await postInstallments(
      createMockRequest(URL_INST, {
        method: "POST",
        body: { ...baseInst, note: undefined, enteredAmount: 25, mode: "each", count: 3 },
      }),
    );
    expect(res.status).toBe(201);
    expect(h.store.tx.map((r) => r.amount)).toEqual([25, 25, 25]);
    expect(h.store.tx.map((r) => decryptField(TEST_DEK, r.note as string))).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("converts each row at its own date when the entered currency differs", async () => {
    const res = await postInstallments(
      createMockRequest(URL_INST, { method: "POST", body: { ...baseInst, enteredCurrency: "EUR", enteredAmount: -100, count: 2 } }),
    );
    expect(res.status).toBe(201);
    expect(h.store.tx[0]).toMatchObject({ amount: -100, enteredAmount: -50, enteredCurrency: "EUR", enteredFxRate: 2, currency: "USD" });
  });

  it("is atomic: a failure on row k leaves zero rows persisted", async () => {
    h.failAtCall = 4;
    const res = await postInstallments(createMockRequest(URL_INST, { method: "POST", body: baseInst }));
    expect(res.status).toBe(500);
    expect(h.createCalls).toBe(4); // rows 1-3 were written inside the transaction, then rolled back
    expect(h.store.tx).toHaveLength(0);
  });

  it("rejects a client-supplied installment group id / seq / subscription id (400, nothing written)", async () => {
    for (const extra of [{ installmentGroupId: "evil" }, { installmentSeq: 3 }, { subscriptionId: 5 }, { installment_group_id: "x" }]) {
      const res = await postInstallments(createMockRequest(URL_INST, { method: "POST", body: { ...baseInst, ...extra } }));
      const { status, data } = await parseResponse(res);
      expect(status).toBe(400);
      expect((data as { code: string }).code).toBe("server_managed_field");
    }
    expect(h.store.tx).toHaveLength(0);
  });

  it("validates count bounds, mode, amount and date", async () => {
    const bad: Array<Record<string, unknown>> = [
      { count: 1 }, { count: 61 }, { count: 2.5 }, { mode: "weird" }, { enteredAmount: 0 },
      { date: "2026-13-45" }, { date: "tomorrow" }, { accountId: 0 }, { categoryId: 0 }, { enteredCurrency: "" },
    ];
    for (const patch of bad) {
      const res = await postInstallments(createMockRequest(URL_INST, { method: "POST", body: { ...baseInst, ...patch } }));
      expect(res.status, JSON.stringify(patch)).toBe(400);
    }
    expect(h.store.tx).toHaveLength(0);
  });

  it("accepts the boundary counts 2 and 60", async () => {
    for (const count of [2, 60]) {
      h.store.tx = [];
      const res = await postInstallments(createMockRequest(URL_INST, { method: "POST", body: { ...baseInst, count, enteredAmount: -6000 } }));
      expect(res.status).toBe(201);
      expect(h.store.tx).toHaveLength(count);
    }
  });

  it("returns 400 when the total is too small to split", async () => {
    const res = await postInstallments(createMockRequest(URL_INST, { method: "POST", body: { ...baseInst, enteredAmount: -0.05, count: 6 } }));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(400);
    expect((data as { code: string }).code).toBe("invalid_plan");
  });

  it("returns 423 without a DEK and 401 when unauthenticated", async () => {
    h.authDek = null;
    expect((await postInstallments(createMockRequest(URL_INST, { method: "POST", body: baseInst }))).status).toBe(423);
    vi.mocked(requireAuth).mockResolvedValueOnce({
      authenticated: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await postInstallments(createMockRequest(URL_INST, { method: "POST", body: baseInst }))).status).toBe(401);
    expect(h.store.tx).toHaveLength(0);
  });
});

describe("POST /api/transactions { repeat }", () => {
  const body = { date: "2026-10-10", accountId: 1, categoryId: 2, payee: "Netflix", enteredAmount: -15, enteredCurrency: "USD" };

  it("creates a subscription (next date after the booked date) and links the booked row", async () => {
    const res = await postTx(
      createMockRequest(URL_TX, { method: "POST", body: { ...body, repeat: { frequency: "monthly", end: { type: "count", count: 12 } } } }),
    );
    const { status, data } = await parseResponse(res);
    expect(status).toBe(201);
    expect((data as { subscription: unknown }).subscription).toEqual({ id: 901, created: true });
    expect(h.store.subs).toHaveLength(1);
    expect(h.store.subs[0]).toMatchObject({
      userId: "u1", amount: 15, currency: "USD", frequency: "monthly", accountId: 1, categoryId: 2,
      nextDate: "2026-11-10", status: "active", endDate: null, remainingCount: 11,
    });
    expect(h.store.subs[0].nameLookup).toBe(nameLookup(TEST_DEK, "Netflix"));
    expect(decryptField(TEST_DEK, h.store.subs[0].nameCt as string)).toBe("Netflix");
    expect(h.store.tx).toHaveLength(1);
    expect(h.store.tx[0].subscriptionId).toBe(901);
    expect("repeat" in h.store.tx[0]).toBe(false);
  });

  it("supports the new frequencies and an until-date", async () => {
    const res = await postTx(
      createMockRequest(URL_TX, {
        method: "POST",
        body: { ...body, date: "2026-01-15", repeat: { frequency: "monthly_eom", end: { type: "until", date: "2026-12-31" } } },
      }),
    );
    expect(res.status).toBe(201);
    expect(h.store.subs[0]).toMatchObject({ frequency: "monthly_eom", nextDate: "2026-01-31", endDate: "2026-12-31", remainingCount: null });
  });

  it("forever (or no end) stores no end fields", async () => {
    await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, repeat: { frequency: "every4weeks" } } }));
    expect(h.store.subs[0]).toMatchObject({ frequency: "every4weeks", nextDate: "2026-11-07", endDate: null, remainingCount: null });
  });

  it("links an existing active subscription that matches (no new subscription)", async () => {
    h.existingSub = { id: 42, status: "active", frequency: "monthly", accountId: 1, amount: 15 };
    const res = await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, repeat: { frequency: "monthly" } } }));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(201);
    expect((data as { subscription: unknown }).subscription).toEqual({ id: 42, created: false });
    expect(h.store.subs).toHaveLength(0);
    expect(h.store.tx[0].subscriptionId).toBe(42);
  });

  it("409s (and writes nothing) when a different subscription owns the payee name", async () => {
    h.existingSub = { id: 42, status: "active", frequency: "weekly", accountId: 1, amount: 15 };
    const res = await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, repeat: { frequency: "monthly" } } }));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(409);
    expect((data as { code: string }).code).toBe("repeat_subscription_name_conflict");
    expect(h.store.tx).toHaveLength(0);
    expect(h.store.subs).toHaveLength(0);
  });

  it("maps a name_lookup unique violation from a concurrent create to 409", async () => {
    h.subInsertError = Object.assign(new Error("dup"), { code: "23505", constraint: "subscriptions_user_name_lookup_uniq" });
    const res = await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, repeat: { frequency: "monthly" } } }));
    expect(res.status).toBe(409);
    expect(h.store.tx).toHaveLength(0);
  });

  it("rolls the subscription back when the booked row fails to insert", async () => {
    h.failAtCall = 1;
    const res = await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, repeat: { frequency: "monthly" } } }));
    expect(res.status).toBe(500);
    expect(h.store.subs).toHaveLength(0);
    expect(h.store.tx).toHaveLength(0);
  });

  it("validates repeat: unknown frequency, bad end, missing payee, end before first repeat, holding rows", async () => {
    const cases: Array<[Record<string, unknown>, number]> = [
      [{ repeat: { frequency: "hourly" } }, 400],
      [{ repeat: { frequency: "monthly", end: { type: "count", count: 1 } } }, 400],
      [{ repeat: { frequency: "monthly", end: { type: "until", date: "nope" } } }, 400],
      [{ repeat: { frequency: "monthly", end: { type: "sometimes" } } }, 400],
      [{ payee: "  ", repeat: { frequency: "monthly" } }, 400],
      [{ repeat: { frequency: "monthly", end: { type: "until", date: "2026-10-20" } } }, 400],
      [{ portfolioHoldingId: 5, repeat: { frequency: "monthly" } }, 400],
    ];
    for (const [patch, expected] of cases) {
      const res = await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, ...patch } }));
      expect(res.status, JSON.stringify(patch)).toBe(expected);
    }
    expect(h.store.tx).toHaveLength(0);
    expect(h.store.subs).toHaveLength(0);
  });

  it("without repeat nothing changes and the client cannot set series columns", async () => {
    const res = await postTx(
      createMockRequest(URL_TX, {
        method: "POST",
        body: { ...body, installmentGroupId: "evil", installmentSeq: 9, occurrence_date: "2026-01-01", subscription_id: 7 },
      }),
    );
    expect(res.status).toBe(201);
    expect(h.store.tx[0]).not.toHaveProperty("installmentGroupId");
    expect(h.store.tx[0]).not.toHaveProperty("installmentSeq");
    expect(h.store.tx[0]).not.toHaveProperty("subscriptionId");
    expect(h.store.subs).toHaveLength(0);
  });

  it("423 without a DEK", async () => {
    h.authDek = null;
    const res = await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, repeat: { frequency: "monthly" } } }));
    expect(res.status).toBe(423);
  });
});

describe("DELETE /api/transactions?scope=following", () => {
  const d = (qs: string) => createMockRequest(`${URL_TX}?${qs}`, { method: "DELETE" });

  it("deletes this and every later seq of the same group in one cascade call", async () => {
    h.seedRow = { groupId: "g-1", seq: 3 };
    h.laterRows = [{ id: 13 }, { id: 14 }, { id: 15 }, { id: 16 }];
    const res = await deleteTx(d("id=13&scope=following"));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(200);
    expect(h.cascadeIds).toEqual([[13, 14, 15, 16]]);
    expect((data as { deletedIds: number[] }).deletedIds).toEqual([13, 14, 15, 16]);
    // The lookup is scoped to the user, the group and seq >= seed seq.
    const dialect = new PgDialect();
    const later = h.whereLog.filter((w) => w.table === "transactions").pop()!;
    const q = dialect.sqlToQuery(later.cond as never);
    expect(q.sql).toContain('"transactions"."user_id" = $');
    expect(q.sql).toContain('"transactions"."installment_group_id" = $');
    expect(q.sql).toContain('"transactions"."installment_seq" >= $');
    expect(q.params).toEqual(expect.arrayContaining(["u1", "g-1", 3]));
  });

  it("includes the requested id even if the group lookup omits it", async () => {
    h.seedRow = { groupId: "g-1", seq: 6 };
    h.laterRows = [];
    await deleteTx(d("id=20&scope=following"));
    expect(h.cascadeIds).toEqual([[20]]);
  });

  it("400 for a row that is not part of an installment group", async () => {
    h.seedRow = { groupId: null, seq: null };
    const res = await deleteTx(d("id=5&scope=following"));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(400);
    expect((data as { code: string }).code).toBe("not_installment");
    expect(h.cascadeIds).toEqual([]);
  });

  it("scope=this (default) deletes just the one row", async () => {
    const res = await deleteTx(d("id=13"));
    expect(res.status).toBe(200);
    expect(h.cascadeIds).toEqual([[13]]);
    const res2 = await deleteTx(d("id=14&scope=this"));
    expect(res2.status).toBe(200);
    expect(h.cascadeIds).toEqual([[13], [14]]);
  });

  it("400 for an unknown scope", async () => {
    const res = await deleteTx(d("id=13&scope=all"));
    expect(res.status).toBe(400);
  });

  it("unknown / foreign id falls through to the cascade not_found (404)", async () => {
    h.seedRow = null;
    vi.mocked(deleteTransactionsCascade).mockResolvedValueOnce({ ok: false, reason: "not_found", missingIds: [99], message: "x" });
    const res = await deleteTx(d("id=99&scope=following"));
    expect(res.status).toBe(404);
  });

  it("keeps the portfolio_edit_blocked 409", async () => {
    h.seedRow = { groupId: "g-1", seq: 1 };
    h.laterRows = [{ id: 1 }];
    vi.mocked(deleteTransactionsCascade).mockResolvedValueOnce({
      ok: false, reason: "portfolio_edit_blocked", blockingClosureTxIds: [7], message: "blocked",
    });
    const res = await deleteTx(d("id=1&scope=following"));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(409);
    expect((data as { code: string }).code).toBe("portfolio_edit_blocked");
  });
});
