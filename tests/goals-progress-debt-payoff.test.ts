/**
 * debt_payoff goals link a liability account whose balance is negative (the
 * amount still owed). Progress must be the paid-off share of the target, not
 * the raw negative balance (which rendered as "-100%").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbHolder = vi.hoisted(() => ({ results: [] as unknown[][] }));
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "groupBy"]) chain[m] = vi.fn(() => chain);
  chain.then = (r: (v: unknown) => unknown) =>
    r(dbHolder.results.length ? dbHolder.results.shift()! : []);
  const tbl = { id: {}, userId: {}, currency: {}, isInvestment: {}, accountId: {}, amount: {} };
  return { db: chain, schema: { accounts: tbl, transactions: tbl } };
});
vi.mock("@/lib/holdings-value", () => ({
  getHoldingsValueByAccount: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/fx-service", () => ({ getLatestFxRate: vi.fn(async () => 1) }));

import { computeGoalProgress } from "@/lib/goals-progress";

function queueLoanBalance(balance: number) {
  dbHolder.results = [
    [{ id: 22, currency: "VND", isInvestment: false }],
    [{ accountId: 22, total: balance }],
  ];
}

const goal = (type: string | null) => ({
  id: 3,
  type,
  currency: "VND",
  targetAmount: 150_000_000,
  deadline: null,
  accountIds: [22],
});

describe("computeGoalProgress — debt_payoff", () => {
  beforeEach(() => {
    dbHolder.results = [];
  });

  it("reads 0% when the full target is still owed", async () => {
    queueLoanBalance(-150_000_000);
    const p = (await computeGoalProgress("u1", null, [goal("debt_payoff")])).get(3)!;
    expect(p.currentAmount).toBe(0);
    expect(p.progress).toBe(0);
    expect(p.remaining).toBe(150_000_000);
  });

  it("counts the paid-down part of the debt as progress", async () => {
    queueLoanBalance(-90_000_000);
    const p = (await computeGoalProgress("u1", null, [goal("debt_payoff")])).get(3)!;
    expect(p.currentAmount).toBe(60_000_000);
    expect(p.progress).toBe(40);
    expect(p.remaining).toBe(90_000_000);
  });

  it("reads 100% once the loan balance reaches zero", async () => {
    queueLoanBalance(0);
    const p = (await computeGoalProgress("u1", null, [goal("debt_payoff")])).get(3)!;
    expect(p.progress).toBe(100);
    expect(p.remaining).toBe(0);
  });

  it("leaves savings goals unchanged", async () => {
    queueLoanBalance(60_000_000);
    const p = (await computeGoalProgress("u1", null, [goal("savings")])).get(3)!;
    expect(p.currentAmount).toBe(60_000_000);
    expect(p.progress).toBe(40);
  });
});
