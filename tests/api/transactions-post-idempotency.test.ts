// @vitest-environment node
/**
 * POST /api/transactions Idempotency-Key header (local-first outbox).
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
  lookupKey: null as unknown,
  committed: [] as Row[],
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
        : [...h.store.tx, ...h.committed].find((r) => r.idempotencyKey === h.lookupKey) ?? undefined;
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

import { createMockRequest as mk } from "../helpers/api-test-utils";
const URL_TX = "http://localhost:3000/api/transactions";
const base = { date: "2026-03-12", accountId: 1, categoryId: 2, payee: "Gym", enteredCurrency: "USD", enteredAmount: -40 };
const post = (key?: string) =>
  postTx(mk(URL_TX, { method: "POST", body: base, headers: key ? { "Idempotency-Key": key } : {} }));
const dupErr = () => Object.assign(new Error("dup"), { code: "23505", constraint: "uniq_transactions_idempotency_key" });

beforeEach(() => {
  h.store = { tx: [], subs: [] };
  h.createCalls = 0;
  h.authDek = TEST_DEK;
  h.insertError = null;
  h.lookupKey = null;
  h.committed = [];
  vi.mocked(createTransaction).mockClear();
});

describe("POST /api/transactions Idempotency-Key", () => {
  it("first POST stores the key; replay returns the same id with 201 and inserts nothing", async () => {
    h.lookupKey = "op-1";
    const a = await parseResponse(await post("op-1"));
    expect(a.status).toBe(201);
    expect(h.store.tx).toHaveLength(1);
    expect(h.store.tx[0]).toMatchObject({ idempotencyKey: "op-1" });
    const b = await parseResponse(await post("op-1"));
    expect(b.status).toBe(201);
    expect((b.data as Row).id).toBe((a.data as Row).id);
    expect(h.store.tx).toHaveLength(1);
    expect(createTransaction).toHaveBeenCalledTimes(1);
    expect(markCash).toHaveBeenCalledTimes(1); // side effects ran once
  });

  it("race: insert loses to a concurrent winner (23505 on the key index) -> existing row returned", async () => {
    h.lookupKey = "op-2";
    // the first lookup misses, then the winner commits and our insert raises 23505
    const winner = { id: 555, userId: "u1", idempotencyKey: "op-2", payee: "winner" };
    vi.mocked(createTransaction).mockImplementationOnce(async () => {
      h.committed.push(winner); // committed by the other request, outside our rolled-back tx
      throw dupErr();
    });
    const r = await parseResponse(await post("op-2"));
    expect(r.status).toBe(201);
    expect((r.data as Row).id).toBe(555);
    expect(h.store.tx).toHaveLength(0);
  });

  it("no header: unchanged behaviour, no key stored, two POSTs make two rows", async () => {
    await post();
    await post();
    expect(h.store.tx).toHaveLength(2);
    for (const r of h.store.tx) expect(r.idempotencyKey).toBeUndefined();
  });

  it("a different key is a different row", async () => {
    h.lookupKey = "op-a";
    await post("op-a");
    h.lookupKey = "op-b";
    await post("op-b");
    expect(h.store.tx).toHaveLength(2);
  });
});
