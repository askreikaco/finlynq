/**
 * Deterministic ~240-row Transactions fixture for paging parity tests.
 *
 * Shape matches the client `Transaction` row (the hook's input). Built from a
 * local seeded PRNG only: no Math.random, no Date.now. Same output every run.
 *
 * Coverage: repeated dates and amounts/createdAt values (ties), null and
 * non-null quantity, zero amounts, 3 accounts of 2 types, 4 categories,
 * holdings (named and unnamed), multi-tag rows, every TransactionSource.
 */
import type { Transaction } from "@/app/(app)/transactions/_types";
import { SOURCES, type TransactionSource } from "@/lib/tx-source";

export const FIXTURE_SEED = 0x5eed;
export const FIXTURE_SIZE = 240;

/** mulberry32: tiny seeded PRNG, returns floats in [0, 1). */
export function seededPrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIXTURE_ACCOUNTS = [
  { id: 1, name: "Chequing", alias: "CHQ", type: "bank" },
  { id: 2, name: "Savings", alias: null, type: "bank" },
  { id: 3, name: "Brokerage", alias: "BRK", type: "investment" },
] as const;

export const FIXTURE_CATEGORIES = [
  { id: 10, name: "Groceries", type: "E" },
  { id: 11, name: "Salary", type: "I" },
  { id: 12, name: "Dividends", type: "I" },
  { id: 13, name: "Transfer", type: "T" },
] as const;

export const FIXTURE_HOLDINGS = [
  { name: "Vanguard Growth ETF", symbol: "VGRO.TO" },
  { name: "Apple Inc", symbol: "AAPL" },
] as const;

const PAYEES = ["Metro", "Metro Market", "Payroll Co", "Brokerage Fee", "Corner Cafe", "", "Acme"];
const NOTES = ["weekly shop", "", "bonus", "fee waiver", "split with partner", "dividend Q3"];
const TAG_SETS = ["", "food", "food,weekly", "salary", "fees,travel", "invest", "food,fees"];
const KINDS: (string | null)[] = [null, null, null, "buy", "sell", "buy_cash_leg"];

const DATES = [
  "2026-01-05", "2026-01-12", "2026-01-19", "2026-02-02", "2026-02-09",
  "2026-02-16", "2026-02-23", "2026-03-02", "2026-03-09", "2026-03-16",
];
const AMOUNTS = [-120.5, -45, -45, 0, 0, 2500, 1200.25, -9.99, 75, -300, 45, -1000];

export function buildTxPagingFixture(): Transaction[] {
  const rnd = seededPrng(FIXTURE_SEED);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const rows: Transaction[] = [];
  for (let i = 0; i < FIXTURE_SIZE; i++) {
    const id = 1000 + i; // stable ids; not sorted by date on purpose
    const acct = pick(FIXTURE_ACCOUNTS);
    const isInvest = acct.type === "investment";
    const cat = isInvest ? pick(FIXTURE_CATEGORIES.slice(2)) : pick(FIXTURE_CATEGORIES.slice(0, 3));
    const holding = isInvest || rnd() < 0.15 ? pick(FIXTURE_HOLDINGS) : null;
    const date = pick(DATES);
    const amount = isInvest ? pick([-500, -250, 0, 300]) : pick(AMOUNTS);
    const quantity = holding ? pick([1, 2, 5, 10, 0.5]) : rnd() < 0.5 ? null : pick([1, 3]);
    // createdAt/updatedAt: a few shared timestamps (ties) plus unique ones.
    const createdAt = `2026-01-${String(1 + (i % 9)).padStart(2, "0")}T10:00:00.000Z`;
    const updatedAt = i % 4 === 0 ? createdAt : `2026-02-${String(1 + (i % 20)).padStart(2, "0")}T08:30:00.000Z`;
    const source: TransactionSource = SOURCES[i % SOURCES.length];
    rows.push({
      id,
      date,
      accountId: acct.id,
      accountName: acct.name,
      accountAlias: acct.alias,
      accountType: acct.type,
      categoryId: cat.id,
      categoryName: cat.name,
      categoryType: cat.type,
      currency: "USD",
      amount,
      enteredAmount: amount,
      enteredCurrency: "USD",
      enteredFxRate: 1,
      quantity,
      portfolioHolding: holding?.name ?? null,
      portfolioHoldingSymbol: holding?.symbol ?? null,
      note: pick(NOTES),
      payee: pick(PAYEES),
      tags: pick(TAG_SETS),
      isBusiness: rnd() < 0.2 ? 1 : 0,
      linkId: null,
      createdAt,
      updatedAt,
      source,
      kind: isInvest ? pick(["buy", "sell", "buy_cash_leg"]) : pick(KINDS),
      tradeLinkId: null,
    });
  }
  return rows;
}
