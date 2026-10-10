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
  updateCalls: 0,
  failAtUpdate: 0,
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
import { POST as postTx, PUT as putTx, DELETE as deleteTx } from "@/app/api/transactions/route";
import { requireAuth } from "@/lib/auth/require-auth";
import { createTransaction, updateTransaction } from "@/lib/queries";
import { canEditPortfolioRow } from "@/lib/portfolio/operations";
import { verifyOwnership } from "@/lib/verify-ownership";
import { encryptField } from "@/lib/crypto/envelope";
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

  it("anchors the series on the BOOKED date so a Jan 31 booking continues Feb 28 -> Mar 31", async () => {
    await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, date: "2026-01-31", repeat: { frequency: "monthly" } } }));
    expect(h.store.subs[0]).toMatchObject({ frequency: "monthly", nextDate: "2026-02-28", anchorDate: "2026-01-31" });
  });

  it("accepts daily / weekdays / weekend (booked on a Friday: weekdays repeat Monday, weekend Saturday)", async () => {
    // 2026-10-09 is a Friday.
    for (const [frequency, next] of [["daily", "2026-10-10"], ["weekdays", "2026-10-12"], ["weekend", "2026-10-10"]] as const) {
      h.store.subs.length = 0;
      const res = await postTx(createMockRequest(URL_TX, { method: "POST", body: { ...body, date: "2026-10-09", repeat: { frequency } } }));
      expect(res.status).toBe(201);
      expect(h.store.subs[0]).toMatchObject({ frequency, nextDate: next, anchorDate: "2026-10-09" });
    }
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

describe("PUT /api/transactions scope=following (installment edit)", () => {
  const put = (body: Record<string, unknown>) => createMockRequest(URL_TX, { method: "PUT", body });
  const note = (id: number) => decryptField(TEST_DEK, h.store.tx.find((r) => r.id === id)!.note as string);
  const dialect = new PgDialect();

  beforeEach(() => {
    vi.mocked(canEditPortfolioRow).mockReset();
    vi.mocked(canEditPortfolioRow).mockResolvedValue({ allowed: true } as never);
    vi.mocked(verifyOwnership).mockClear();
    vi.mocked(updateTransaction).mockReset();
    vi.mocked(updateTransaction).mockImplementation((async (id: number, _u: string, data: Row) => {
      h.updateCalls++;
      if (h.failAtUpdate && h.updateCalls === h.failAtUpdate) throw new Error("boom on update " + h.updateCalls);
      h.store.tx = h.store.tx.map((r) => (r.id === id ? { ...r, ...data } : r));
      return h.store.tx.find((r) => r.id === id);
    }) as never);
    h.updateCalls = 0;
    h.failAtUpdate = 0;
    // A 4-payment plan, edited row = seq 2 (id 12). Rows 11..14, own suffixes, own dates.
    const mk = (id: number, seq: number, date: string, extra: Row = {}) => ({
      id, seq, date, accountId: 1, currency: "USD", amount: -100, enteredCurrency: "USD", enteredAmount: -100,
      payee: "p-old", tags: "old", categoryId: 2, isBusiness: 0,
      note: encryptField(TEST_DEK, `Laptop ${seq}/4`), ...extra,
    });
    const all = [mk(11, 1, "2026-01-10"), mk(12, 2, "2026-02-10"), mk(13, 3, "2026-03-10"), mk(14, 4, "2026-04-10", { amount: -103, enteredAmount: -103 })];
    h.store.tx = all;
    h.seedRow = { groupId: "g-1", seq: 2, accountId: 1, currency: "USD", amount: -100, enteredCurrency: "USD", enteredAmount: -100 };
    h.laterRows = all.slice(1);
  });

  const base = { id: 12, scope: "following", categoryId: 5, accountId: 1, payee: "New shop", tags: "t", isBusiness: 1, date: "2026-02-20" };

  it("applies shared fields to this and every later row, keeps each row's own suffix, never the date", async () => {
    const res = await putTx(put({ ...base, note: "Phone case 2/4", enteredAmount: -100, enteredCurrency: "USD" }));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(200);
    expect((data as { updatedIds: number[] }).updatedIds).toEqual([12, 13, 14]);
    expect(h.updateCalls).toBe(3);
    // edited row 11 (earlier) untouched
    expect(note(11)).toBe("Laptop 1/4");
    expect(h.store.tx.find((r) => r.id === 11)!.categoryId).toBe(2);
    for (const id of [12, 13, 14]) {
      const r = h.store.tx.find((x) => x.id === id)!;
      expect(r.categoryId).toBe(5);
      expect(r.accountId).toBe(1);
      expect(r.isBusiness).toBe(1);
      expect(decryptField(TEST_DEK, r.payee as string)).toBe("New shop");
      expect(decryptField(TEST_DEK, r.tags as string)).toBe("t");
    }
    expect(note(12)).toBe("Phone case 2/4"); // edited row: as submitted
    expect(note(13)).toBe("Phone case 3/4");
    expect(note(14)).toBe("Phone case 4/4");
    // date: only the edited row gets it
    expect(h.store.tx.find((r) => r.id === 12)!.date).toBe("2026-02-20");
    expect(h.store.tx.find((r) => r.id === 13)!.date).toBe("2026-03-10");
    expect(h.store.tx.find((r) => r.id === 14)!.date).toBe("2026-04-10");
    // amount unchanged: later rows keep their own amounts (incl. the remainder row)
    expect(h.store.tx.find((r) => r.id === 14)!.amount).toBe(-103);
    expect((data as { warning?: string }).warning).toBeUndefined();
  });

  it("re-appends own suffix when the submitted note has no suffix, and handles an emptied note", async () => {
    await putTx(put({ ...base, note: "Case" }));
    expect(note(13)).toBe("Case 3/4");
    await putTx(put({ ...base, note: "2/4" }));
    expect(note(13)).toBe("3/4");
    expect(note(14)).toBe("4/4");
  });

  it("leaves fields the body does not carry alone", async () => {
    await putTx(put({ id: 12, scope: "following", tags: "only-tags" }));
    const r = h.store.tx.find((x) => x.id === 13)!;
    expect(decryptField(TEST_DEK, r.tags as string)).toBe("only-tags");
    expect(r.categoryId).toBe(2);
    expect(r.payee).toBe("p-old");
    expect(note(13)).toBe("Laptop 3/4");
  });

  it("amount changed: the new per-payment amount goes to every later row (no remainder) with a warning", async () => {
    const res = await putTx(put({ ...base, note: "x 2/4", enteredAmount: -80, enteredCurrency: "USD" }));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(200);
    for (const id of [12, 13, 14]) {
      const r = h.store.tx.find((x) => x.id === id)!;
      expect(r.amount).toBe(-80);
      expect(r.enteredAmount).toBe(-80);
      expect(r.enteredCurrency).toBe("USD");
    }
    expect(h.store.tx.find((r) => r.id === 11)!.amount).toBe(-100);
    expect((data as { warning: string }).warning).toMatch(/not rebalanced/);
  });

  it("converts the new amount per row with the single-row helper (entered currency differs from the account)", async () => {
    await putTx(put({ ...base, note: "x 2/4", enteredAmount: -50, enteredCurrency: "EUR" }));
    for (const id of [13, 14]) {
      const r = h.store.tx.find((x) => x.id === id)!;
      expect(r.enteredAmount).toBe(-50);
      expect(r.enteredCurrency).toBe("EUR");
      expect(r.amount).toBe(-100); // fake FX x2
      expect(r.enteredFxRate).toBe(2);
    }
  });

  it("an unchanged amount sent again does not touch the later amounts", async () => {
    await putTx(put({ ...base, note: "x 2/4", enteredAmount: -100, enteredCurrency: "USD" }));
    expect(h.store.tx.find((r) => r.id === 14)!.amount).toBe(-103);
  });

  it("an account change alone re-converts each row's own entered amount at its own date", async () => {
    await putTx(put({ id: 12, scope: "following", accountId: 2, categoryId: 5 }));
    for (const id of [12, 13, 14]) expect(h.store.tx.find((r) => r.id === id)!.accountId).toBe(2);
    // row 14 keeps its own remainder amount
    expect(h.store.tx.find((r) => r.id === 14)!.enteredAmount).toBe(-103);
    expect(h.store.tx.find((r) => r.id === 14)!.date).toBe("2026-04-10");
  });

  it("is all or none: a failure on a later row rolls back the edited row and the earlier updates", async () => {
    const before = JSON.stringify(h.store.tx);
    h.failAtUpdate = 3;
    const res = await putTx(put({ ...base, note: "Case 2/4" }));
    expect(res.status).toBe(500);
    expect(h.updateCalls).toBe(3);
    expect(JSON.stringify(h.store.tx)).toBe(before);
  });

  it("scope is validated; default / this updates only the one row without a group lookup", async () => {
    const bad = await parseResponse(await putTx(put({ id: 12, scope: "all" })));
    expect(bad.status).toBe(400);
    expect(h.updateCalls).toBe(0);
    h.whereLog = [];
    const res = await putTx(put({ id: 12, tags: "z" }));
    expect(res.status).toBe(200);
    expect(h.updateCalls).toBe(1);
    expect(note(13)).toBe("Laptop 3/4");
    expect(((await res.json()) as { updatedIds?: number[] }).updatedIds).toBeUndefined();
    const res2 = await putTx(put({ id: 12, tags: "z", scope: "this" }));
    expect(res2.status).toBe(200);
    expect(h.updateCalls).toBe(2);
  });

  it("400 not_installment for a row without a group; nothing written", async () => {
    h.seedRow = { groupId: null, seq: null };
    const res = await putTx(put({ ...base }));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(400);
    expect((data as { code: string }).code).toBe("not_installment");
    expect(h.updateCalls).toBe(0);
  });

  it("404 for an unknown / foreign row id", async () => {
    h.seedRow = null;
    const res = await putTx(put({ ...base }));
    expect(res.status).toBe(404);
    expect(h.updateCalls).toBe(0);
  });

  it("scopes the lookup to the user, the group and seq >= the edited row's; verifies account/category ownership", async () => {
    await putTx(put({ ...base, note: "n 2/4" }));
    const later = h.whereLog.filter((w) => w.table === "transactions").map((w) => dialect.sqlToQuery(w.cond as never)).find((q) => q.sql.includes("installment_seq"));
    expect(later).toBeTruthy();
    expect(later!.sql).toContain('"transactions"."user_id" = $');
    expect(later!.sql).toContain('"transactions"."installment_group_id" = $');
    expect(later!.sql).toContain('"transactions"."installment_seq" >= $');
    expect(later!.params).toEqual(expect.arrayContaining(["u1", "g-1", 2]));
    expect(verifyOwnership).toHaveBeenCalledWith("u1", expect.objectContaining({ accountIds: [1], categoryIds: [5] }));
  });

  it("keeps the portfolio_edit_blocked 409 and writes nothing", async () => {
    vi.mocked(canEditPortfolioRow).mockResolvedValue({ allowed: false, reason: "blocked", blockingClosureTxIds: [3] } as never);
    const res = await putTx(put({ ...base }));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(409);
    expect((data as { code: string }).code).toBe("portfolio_edit_blocked");
    expect(h.updateCalls).toBe(0);
  });

  it("423 without a DEK", async () => {
    h.authDek = null;
    const res = await putTx(put({ ...base }));
    expect(res.status).toBe(423);
    expect(h.updateCalls).toBe(0);
  });
});
