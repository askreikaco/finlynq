/**
 * Optional `enteredCurrency` on createTransferPair: the typed amount is converted
 * to the From account currency (same resolveTxAmountsCore as /api/transactions)
 * before the legs are written; the To leg then follows the existing rules.
 * Harness mirrors tests/transfer-category-canonical.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_DEK = Buffer.alloc(32, 0xaa);

// Capture every transactions INSERT so we can assert the category id on each leg.
const insertedTx = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
// Capture category INSERTs (the auto-create branch).
const insertedCat = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

const dbHolder = vi.hoisted(() => ({ results: [] as unknown[][] }));
vi.mock("@/db", () => {
  // A tagged chain remembers which table an insert targets so we can route the
  // captured values + dequeue the right `.returning()` result.
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = { __table: null as unknown };
    const passthrough = ["select", "from", "where", "leftJoin", "orderBy", "groupBy", "set", "update", "delete", "limit"];
    for (const m of passthrough) chain[m] = vi.fn(() => chain);
    chain.insert = vi.fn((tbl: { __name?: string }) => {
      chain.__table = tbl?.__name ?? null;
      return chain;
    });
    chain.values = vi.fn((v: Record<string, unknown>) => {
      if (chain.__table === "transactions") insertedTx.rows.push(v);
      if (chain.__table === "categories") insertedCat.rows.push(v);
      return chain;
    });
    const resolve = () => (dbHolder.results.length ? dbHolder.results.shift()! : []);
    chain.returning = vi.fn(() => resolve());
    chain.all = vi.fn(() => resolve());
    chain.get = vi.fn(() => resolve()[0]);
    chain.then = (r: (v: unknown) => unknown) => r(resolve());
    chain.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(chain));
    chain.onConflictDoNothing = vi.fn(() => chain);
    return chain;
  }
  const db = makeChain();
  const tbl = (name: string) => ({ __name: name, id: {}, userId: {}, type: {}, group: {}, nameLookup: {}, nameCt: {}, currency: {} });
  return {
    db,
    schema: {
      accounts: tbl("accounts"),
      categories: tbl("categories"),
      transactions: tbl("transactions"),
      transactionBankLinks: tbl("transactionBankLinks"),
      portfolioHoldings: tbl("portfolioHoldings"),
    },
  };
});

// Deterministic crypto: nameLookup("Transfer") is a fixed token; buildNameFields
// returns plaintext fields; encryptTxWrite/decryptName identity.
vi.mock("@/lib/crypto/encrypted-columns", () => ({
  nameLookup: (_dek: Buffer, name: string) => `lookup:${name}`,
  buildNameFields: (_dek: Buffer, { name }: { name: string }) => ({ nameCt: `ct:${name}`, nameLookup: `lookup:${name}` }),
  encryptTxWrite: (_dek: Buffer, row: Record<string, unknown>) => row,
  decryptTxRows: (_dek: Buffer, rows: unknown[]) => rows,
  decryptName: (_ct: string, _dek: Buffer, fallback: string | null) => fallback ?? "Acct",
}));
vi.mock("@/lib/crypto/envelope", () => ({
  encryptField: (_dek: Buffer, v: string) => v,
  decryptField: (_dek: Buffer, v: string) => v,
}));

const convMock = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/currency-conversion", () => ({
  resolveTxAmountsCore: (...a: unknown[]) => convMock.fn(...a),
}));
// Non-investment accounts — skip the holding-required path entirely.
vi.mock("@/lib/investment-account", () => ({
  isInvestmentAccount: vi.fn(async () => false),
  InvestmentHoldingRequiredError: class extends Error {},
}));
vi.mock("@/lib/portfolio/lots/write-hooks", () => ({ transferLotHook: vi.fn(async () => undefined) }));
vi.mock("@/lib/mcp/user-tx-cache", () => ({ invalidateUser: vi.fn() }));
vi.mock("@/lib/external-import/portfolio-holding-resolver", () => ({ buildHoldingResolver: vi.fn() }));

import { createTransferPair } from "@/lib/transfer";

beforeEach(() => {
  vi.clearAllMocks();
  dbHolder.results = [];
  insertedTx.rows = [];
  insertedCat.rows = [];
  convMock.fn.mockReset();
});

function queueAccounts(fromCcy: string, toCcy: string) {
  dbHolder.results.push([
    { id: 1, nameCt: "ct:Checking", currency: fromCcy },
    { id: 2, nameCt: "ct:Savings", currency: toCcy },
  ]);
}

/** Category lookup hit + both leg inserts. */
function queueWrites() {
  dbHolder.results.push([{ id: 99 }]);
  dbHolder.results.push([{ id: 501 }]);
  dbHolder.results.push([{ id: 502 }]);
}

describe("createTransferPair — optional enteredCurrency", () => {
  it("omitted enteredCurrency: no conversion call, legs carry the amount as typed", async () => {
    queueAccounts("USD", "USD");
    queueWrites();
    const res = await createTransferPair({
      userId: "user-1", dek: TEST_DEK, fromAccountId: 1, toAccountId: 2, enteredAmount: 100, date: "2026-06-17",
    });
    expect(res.ok).toBe(true);
    expect(convMock.fn).not.toHaveBeenCalled();
    expect(insertedTx.rows[0]).toMatchObject({ amount: -100, enteredAmount: -100, currency: "USD" });
    expect(insertedTx.rows[1]).toMatchObject({ amount: 100, enteredAmount: 100 });
  });

  it("enteredCurrency equal to the From currency (any case) is a no-op", async () => {
    queueAccounts("USD", "USD");
    queueWrites();
    const res = await createTransferPair({
      userId: "user-1", dek: TEST_DEK, fromAccountId: 1, toAccountId: 2, enteredAmount: 100,
      enteredCurrency: "usd", date: "2026-06-17",
    });
    expect(res.ok).toBe(true);
    expect(convMock.fn).not.toHaveBeenCalled();
  });

  it("converts the typed EUR amount to the USD From account and books the converted amount", async () => {
    queueAccounts("USD", "USD");
    queueWrites();
    convMock.fn.mockResolvedValueOnce({ ok: true, amount: 125, currency: "USD", enteredFxRate: 1.25, enteredAmount: 100, enteredCurrency: "EUR" });
    const res = await createTransferPair({
      userId: "user-1", dek: TEST_DEK, fromAccountId: 1, toAccountId: 2, enteredAmount: 100,
      enteredCurrency: "EUR", date: "2026-06-17",
    });
    expect(res.ok).toBe(true);
    expect(convMock.fn).toHaveBeenCalledTimes(1);
    expect(convMock.fn.mock.calls[0][0]).toMatchObject({
      accountCurrency: "USD", enteredAmount: 100, enteredCurrency: "EUR", date: "2026-06-17",
    });
    // Source leg: From currency, converted amount.
    expect(insertedTx.rows[0]).toMatchObject({ currency: "USD", amount: -125, enteredCurrency: "USD", enteredAmount: -125 });
    // Same-currency To leg receives the converted amount unchanged.
    expect(insertedTx.rows[1]).toMatchObject({ currency: "USD", amount: 125, enteredAmount: 125 });
    if (res.ok) expect(res.fromAmount).toBe(-125);
  });

  it("with a cross-currency To account, the To amount is derived from the converted From amount", async () => {
    queueAccounts("USD", "EUR");
    queueWrites();
    convMock.fn
      // 1st call: entered EUR -> From USD.
      .mockResolvedValueOnce({ ok: true, amount: 125, currency: "USD", enteredFxRate: 1.25, enteredAmount: 100, enteredCurrency: "EUR" })
      // 2nd call: existing To derivation, From USD -> To EUR.
      .mockResolvedValueOnce({ ok: true, amount: 100, currency: "EUR", enteredFxRate: 0.8, enteredAmount: 125, enteredCurrency: "USD" });
    const res = await createTransferPair({
      userId: "user-1", dek: TEST_DEK, fromAccountId: 1, toAccountId: 2, enteredAmount: 100,
      enteredCurrency: "EUR", date: "2026-06-17",
    });
    expect(res.ok).toBe(true);
    expect(convMock.fn).toHaveBeenCalledTimes(2);
    expect(convMock.fn.mock.calls[1][0]).toMatchObject({ accountCurrency: "EUR", enteredAmount: 125, enteredCurrency: "USD" });
    expect(insertedTx.rows[0]).toMatchObject({ amount: -125, enteredAmount: -125 });
    expect(insertedTx.rows[1]).toMatchObject({ currency: "EUR", amount: 100, enteredFxRate: 0.8 });
  });

  it("fails with fx-currency-needs-override on the source side and writes nothing", async () => {
    queueAccounts("USD", "USD");
    convMock.fn.mockResolvedValueOnce({
      ok: false, code: "fx-currency-needs-override", currency: "XYZ", message: "No FX rate available for XYZ.",
    });
    const res = await createTransferPair({
      userId: "user-1", dek: TEST_DEK, fromAccountId: 1, toAccountId: 2, enteredAmount: 100,
      enteredCurrency: "XYZ", date: "2026-06-17",
    });
    expect(res).toMatchObject({ ok: false, code: "fx-currency-needs-override", side: "source", currency: "XYZ" });
    expect(insertedTx.rows).toHaveLength(0);
  });

  it("refuses a cash transfer whose converted amount rounds to zero", async () => {
    queueAccounts("USD", "USD");
    convMock.fn.mockResolvedValueOnce({ ok: true, amount: 0.001, currency: "USD", enteredFxRate: 0.00001, enteredAmount: 100, enteredCurrency: "JPY" });
    const res = await createTransferPair({
      userId: "user-1", dek: TEST_DEK, fromAccountId: 1, toAccountId: 2, enteredAmount: 100,
      enteredCurrency: "JPY", date: "2026-06-17",
    });
    expect(res).toMatchObject({ ok: false, code: "invalid-amount" });
    expect(insertedTx.rows).toHaveLength(0);
  });
});
