/**
 * Deterministic SYNTHETIC fixture (local-first prototype P1, PKG-08).
 * Device-only. No real user data. All randomness comes from sim/prng.ts; no Math.random,
 * no Date.now, no wall-clock reads. Same seed + n gives a byte-identical canonical JSON.
 *
 * Row shapes mirror the lean local columns in store/schema.ts (TABLE_COLUMNS property names).
 */

import { Prng } from "../sim/prng";
import { createUlidFactory } from "../oplog/ulid";
import { canonicalJson } from "../oplog/canon";

export type AccountType = "A" | "L";
export type CategoryType = "E" | "I" | "R";
export type FixtureCurrency = "CAD" | "USD";

export interface FixtureAccount {
  id: string;
  serverId: number;
  type: AccountType;
  group: string;
  currency: FixtureCurrency;
  name: string;
  archived: boolean;
  isInvestment: boolean;
  invisible: boolean;
}

export interface FixtureCategory {
  id: string;
  serverId: number;
  type: CategoryType;
  group: string;
  name: string;
}

export interface FixtureTransaction {
  id: string;
  serverId: number;
  date: string;
  accountId: string;
  categoryId: string | null;
  currency: FixtureCurrency;
  amount: number;
  enteredCurrency: FixtureCurrency;
  enteredAmount: number;
  enteredFxRate: number;
  payee: string | null;
  note: string | null;
  tags: string | null;
  linkId: string | null;
}

export interface FixtureDataset {
  seed: number;
  accounts: FixtureAccount[];
  categories: FixtureCategory[];
  transactions: FixtureTransaction[];
}

export const DEFAULT_SEED = 7;
export const DEFAULT_N = 7000;
/** 2024-01-01 .. 2026-12-31 inclusive (2024 is a leap year). */
export const FIXTURE_SPAN_DAYS = 1096;
const START_UTC_MS = Date.UTC(2024, 0, 1);
/** Fixed fx factor used only to fill entered_* columns (synthetic). */
const ENTERED_FX = 1.37;

/** YYYY-MM-DD for a day offset from 2024-01-01 (UTC arithmetic, no wall clock). */
export function dayIso(dayOffset: number): string {
  return new Date(START_UTC_MS + dayOffset * 86400000).toISOString().slice(0, 10);
}

/** Canonical JSON of a whole dataset (sorted keys). Used for the determinism hash. */
export function canonicalFixtureJson(d: FixtureDataset): string {
  return canonicalJson(d);
}

// Fixed account table. Invariants checked by tests/local-first/fixture.test.ts.
const ACCOUNT_SPECS: Array<Omit<FixtureAccount, "id" | "serverId">> = [
  { type: "A", group: "Bank", currency: "CAD", name: "Synth Chequing CAD", archived: false, isInvestment: false, invisible: false },
  { type: "A", group: "Bank", currency: "CAD", name: "Synth Savings CAD", archived: false, isInvestment: false, invisible: false },
  { type: "A", group: "Bank", currency: "USD", name: "Synth Cash USD", archived: false, isInvestment: false, invisible: false },
  { type: "A", group: "Brokerage", currency: "USD", name: "Synth Brokerage USD", archived: false, isInvestment: true, invisible: false },
  { type: "A", group: "Bank", currency: "CAD", name: "Synth Old Chequing CAD", archived: true, isInvestment: false, invisible: false },
  { type: "A", group: "Bank", currency: "USD", name: "Synth Hidden USD", archived: false, isInvestment: false, invisible: true },
  { type: "L", group: "Credit", currency: "CAD", name: "Synth Card CAD", archived: false, isInvestment: false, invisible: false },
  { type: "L", group: "Loan", currency: "USD", name: "Synth Loan USD", archived: false, isInvestment: false, invisible: false },
];

const CATEGORY_SPECS: Array<Omit<FixtureCategory, "id" | "serverId">> = [
  { type: "E", group: "Living", name: "Synth Groceries" },
  { type: "E", group: "Living", name: "Synth Dining" },
  { type: "E", group: "Housing", name: "Synth Rent" },
  { type: "E", group: "Living", name: "Synth Transport" },
  { type: "E", group: "Housing", name: "Synth Utilities" },
  { type: "E", group: "Leisure", name: "Synth Fun" },
  { type: "I", group: "Work", name: "Synth Salary" },
  { type: "I", group: "Investing", name: "Synth Interest" },
  { type: "I", group: "Other", name: "Synth Refunds" },
  { type: "R", group: "Transfers", name: "Synth Transfer" },
  { type: "R", group: "Transfers", name: "Synth Card payment" },
  { type: "R", group: "Investing", name: "Synth Investment buy" },
];

const PAYEES = ["Synth Market", "Synth Cafe", "Synth Landlord", "Synth Metro", "Synth Utility Co", "Synth Cinema", "Synth Employer", "Synth Bank"];
const TAG_SETS = ["synth", "synth,recurring", "synth,one-off", "synth,travel"];

function randomBytesFrom(prng: Prng): (n: number) => Uint8Array {
  return (n: number) => {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = prng.int(0, 255);
    return b;
  };
}

/** Signed non-zero cents in [lo, hi] magnitude, random sign. */
function signedCents(prng: Prng, lo: number, hi: number): number {
  const mag = prng.int(lo, hi);
  return prng.nextFloat() < 0.5 ? -mag : mag;
}

export interface GenerateOptions {
  seed?: number;
  n?: number;
}

/**
 * Generate a deterministic synthetic dataset. generate({seed:7,n:7000}) is the default fixture.
 * Throws on a non-integer seed or a negative/non-integer n.
 */
export function generate(opts: GenerateOptions = {}): FixtureDataset {
  const seed = opts.seed ?? DEFAULT_SEED;
  const n = opts.n ?? DEFAULT_N;
  if (!Number.isInteger(seed)) throw new TypeError("generate: seed must be an integer");
  if (!Number.isInteger(n) || n < 0) throw new RangeError("generate: n must be a non-negative integer");

  const prng = new Prng(seed);
  let tick = 0;
  const ulid = createUlidFactory({
    now: () => START_UTC_MS + tick++,
    random: randomBytesFrom(prng.fork("ids")),
  });

  const accounts: FixtureAccount[] = ACCOUNT_SPECS.map((spec, i) => ({
    ...spec,
    id: ulid(),
    serverId: i + 1,
  }));

  const categories: FixtureCategory[] = CATEGORY_SPECS.map((spec, i) => ({
    ...spec,
    id: ulid(),
    serverId: i + 1,
  }));

  const byType = {
    E: categories.filter((c) => c.type === "E"),
    I: categories.filter((c) => c.type === "I"),
    R: categories.filter((c) => c.type === "R"),
  } as const;

  const txPrng = prng.fork("transactions");
  const transactions: FixtureTransaction[] = [];
  for (let i = 0; i < n; i++) {
    const txId = ulid();
    const day = txPrng.int(0, FIXTURE_SPAN_DAYS - 1);
    const account = accounts[txPrng.int(0, accounts.length - 1)];

    let category: FixtureCategory | null = null;
    let cents: number;
    const roll = txPrng.nextFloat();
    if (roll < 0.08) {
      // null-category row
      cents = signedCents(txPrng, 100, 50000);
    } else if (roll < 0.68) {
      category = byType.E[txPrng.int(0, byType.E.length - 1)];
      cents = -txPrng.int(100, 40000);
    } else if (roll < 0.83) {
      category = byType.I[txPrng.int(0, byType.I.length - 1)];
      cents = txPrng.int(100, 300000);
    } else {
      category = byType.R[txPrng.int(0, byType.R.length - 1)];
      cents = signedCents(txPrng, 100, 90000);
    }
    const amount = cents / 100;

    const crossCurrency = txPrng.nextFloat() < 0.15;
    const enteredCurrency: FixtureCurrency = crossCurrency ? (account.currency === "CAD" ? "USD" : "CAD") : account.currency;
    const enteredAmount = crossCurrency
      ? Math.round((account.currency === "USD" ? amount * ENTERED_FX : amount / ENTERED_FX) * 100) / 100
      : amount;
    const enteredFxRate = crossCurrency ? ENTERED_FX : 1;

    const payee = txPrng.nextFloat() < 0.8 ? PAYEES[txPrng.int(0, PAYEES.length - 1)] : null;
    const note = txPrng.nextFloat() < 0.1 ? `synthetic note ${txPrng.int(1, 99)}` : null;
    const tags = txPrng.nextFloat() < 0.1 ? TAG_SETS[txPrng.int(0, TAG_SETS.length - 1)] : null;

    transactions.push({
      id: txId,
      serverId: i + 1,
      date: dayIso(day),
      accountId: account.id,
      categoryId: category ? category.id : null,
      currency: account.currency,
      amount,
      enteredCurrency,
      enteredAmount,
      enteredFxRate,
      payee,
      note,
      tags,
      linkId: null,
    });
  }

  return { seed, accounts, categories, transactions };
}
