/**
 * Investment scope on the shared transaction query builder, against real Postgres.
 *
 * A row is "investment" when its account has is_investment = true OR
 * portfolio_holding_id IS NOT NULL. scope=daily is the complement, scope=investment
 * is the set, and an unset scope is no filter.
 *
 * Skipped unless DATABASE_URL names a `*_test` database, e.g.
 *   DATABASE_URL=postgresql://devmanager:dev@127.0.0.1:55432/finlynq_test npx vitest run tests/transactions-scope.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTransactions, getTransactionCount, getTransactionsPage } from "@/lib/queries";
import {
  resetTestDb,
  shutdownTestDb,
  createTestUser,
  createAccount,
  createCategory,
  createHolding,
  recordTransaction,
} from "./helpers/portfolio-fixtures";

const DB_URL = process.env.DATABASE_URL || process.env.PF_DATABASE_URL || "";
const enabled = /\/[^/]*_test([?#]|$)/.test(DB_URL);

describe.skipIf(!enabled)("transactions scope: investment vs daily (real Postgres)", () => {
  let userId: string;
  let dailyId: number;
  let investAccountRowId: number;
  let holdingLinkedRowId: number;

  beforeAll(async () => {
    await resetTestDb();
    userId = await createTestUser();
    const bank = await createAccount({ userId, name: "Chequing", currency: "CAD", type: "checking", isInvestment: false });
    const brokerage = await createAccount({ userId, name: "Brokerage", currency: "CAD", isInvestment: true });
    const groceries = await createCategory({ userId, name: "Groceries", type: "E" });
    const holding = await createHolding({ userId, accountId: brokerage, name: "VTI", symbol: "VTI", currency: "CAD" });

    dailyId = await recordTransaction({ userId, accountId: bank, categoryId: groceries, currency: "CAD", amount: -10 });
    // Row in an is_investment account (no holding link).
    investAccountRowId = await recordTransaction({ userId, accountId: brokerage, currency: "CAD", amount: -500 });
    // Row on a plain account but linked to a holding.
    holdingLinkedRowId = await recordTransaction({
      userId,
      accountId: bank,
      currency: "CAD",
      amount: 0,
      quantity: 1,
      portfolioHoldingId: holding,
    });
  });

  afterAll(async () => {
    await shutdownTestDb();
  });

  it("scope=daily excludes investment-account rows and holding-linked rows", async () => {
    expect(Number(await getTransactionCount(userId, { scope: "daily" }))).toBe(1);
    const rows = await getTransactions(userId, { scope: "daily" });
    expect(rows.map((r) => r.id)).toEqual([dailyId]);
  });

  it("scope=investment returns only investment rows (either condition)", async () => {
    expect(Number(await getTransactionCount(userId, { scope: "investment" }))).toBe(2);
    const ids = (await getTransactions(userId, { scope: "investment" })).map((r) => r.id).sort((a, b) => a - b);
    expect(ids).toEqual([investAccountRowId, holdingLinkedRowId].sort((a, b) => a - b));
  });

  it("no scope applies no investment filter", async () => {
    expect(Number(await getTransactionCount(userId, {}))).toBe(3);
    expect(Number(await getTransactionCount(userId, { scope: undefined }))).toBe(3);
  });

  it("scope composes with the cursor page query", async () => {
    const page = await getTransactionsPage(userId, { scope: "investment" }, 10);
    expect(page.rows.map((r) => r.id).sort((a, b) => a - b)).toEqual(
      [investAccountRowId, holdingLinkedRowId].sort((a, b) => a - b),
    );
    expect(page.hasMore).toBe(false);
    const daily = await getTransactionsPage(userId, { scope: "daily" }, 10);
    expect(daily.rows.map((r) => r.id)).toEqual([dailyId]);
  });
});
