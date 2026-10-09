import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { Prng } from "@/lib/local-first/sim/prng";
import {
  generate,
  canonicalFixtureJson,
  dayIso,
  FIXTURE_SPAN_DAYS,
  type FixtureDataset,
} from "@/lib/local-first/fixture/generate";
import {
  accountBalances,
  categoryTotalsE,
  incomeVsExpenses,
  netWorthByMonth,
  heroNetWorth,
  FIXED_RATE_MAP,
  type DateWindow,
} from "@/lib/local-first/fixture/reference";

// Pinned from the first run (seed 7, n 7000). See the log in the PKG-08 report.
const PINNED_SHA256 = "41b09006cde06ddd9c7be4870b6a3e8b1ad1242b93c14d1ed87a95e8828aa7c7";

const sha = (d: FixtureDataset) => createHash("sha256").update(canonicalFixtureJson(d)).digest("hex");
const cents = (x: number) => Math.round(x * 100);
const DATASET = generate({ seed: 7, n: 7000 });

// Independent naive recomputations (plain loops, no reuse of reference.ts).
function naiveBalances(d: FixtureDataset, opts: { includeArchived: boolean; includeInvisible: boolean }) {
  const out: Record<string, number> = {};
  for (const a of d.accounts) {
    if (a.archived && !opts.includeArchived) continue;
    if (a.invisible && !opts.includeInvisible) continue;
    let s = 0;
    for (const t of d.transactions) if (t.accountId === a.id) s += t.amount;
    out[a.id] = s;
  }
  return out;
}

function naiveCategoryE(d: FixtureDataset, w: DateWindow) {
  const out: Record<string, number> = {};
  for (const c of d.categories) {
    if (c.type !== "E") continue;
    let s = 0;
    let any = false;
    for (const t of d.transactions) {
      if (t.categoryId === c.id && t.date >= w.from && t.date <= w.to) {
        s += t.amount;
        any = true;
      }
    }
    if (any) out[c.id] = s;
  }
  return out;
}

function naiveIncomeExpense(d: FixtureDataset, w: DateWindow) {
  const out: Record<string, number> = {};
  const months = [...new Set(d.transactions.map((t) => t.date.slice(0, 7)))];
  for (const m of months)
    for (const type of ["E", "I"])
      for (const cur of ["CAD", "USD"]) {
        let s = 0;
        let any = false;
        for (const t of d.transactions) {
          if (t.date.slice(0, 7) !== m || t.currency !== cur) continue;
          if (t.date < w.from || t.date > w.to) continue;
          const c = d.categories.find((x) => x.id === t.categoryId);
          if (!c || c.type !== type) continue;
          s += t.amount;
          any = true;
        }
        if (any) out[`${m}|${type}|${cur}`] = s;
      }
  return out;
}

function naiveHero(d: FixtureDataset) {
  const bal = naiveBalances(d, { includeArchived: true, includeInvisible: true });
  let assets = 0;
  let liabs = 0;
  for (const a of d.accounts) {
    if (a.invisible) continue;
    const rate = FIXED_RATE_MAP.get(a.currency) ?? 1;
    const conv = Math.round(bal[a.id] * rate * 100) / 100;
    if (a.type === "A") assets += conv;
    else liabs += conv;
  }
  return { assets, liabs, net: assets + liabs };
}

// Three deterministic "random" windows, fixed seed.
const wPrng = new Prng(20260101);
const WINDOWS: DateWindow[] = [0, 1, 2].map(() => {
  const a = wPrng.int(0, FIXTURE_SPAN_DAYS - 1);
  const len = wPrng.int(30, 400);
  return { from: dayIso(a), to: dayIso(Math.min(a + len, FIXTURE_SPAN_DAYS - 1)) };
});

describe("fixture: determinism", () => {
  it("seed 7 gives exactly 7000 transactions", () => {
    expect(DATASET.transactions.length).toBe(7000);
  });

  it("generating twice gives an identical canonical sha256", () => {
    const h1 = sha(generate({ seed: 7, n: 7000 }));
    const h2 = sha(generate({ seed: 7, n: 7000 }));
    expect(h1).toBe(h2);
  });

  it("matches the pinned sha256 of the first run", () => {
    expect(sha(DATASET)).toBe(PINNED_SHA256);
  });

  it("changing the seed changes the hash", () => {
    expect(sha(generate({ seed: 8, n: 7000 }))).not.toBe(sha(DATASET));
  });

  it("generate({n:100000}) yields exactly 100000 transactions", () => {
    expect(generate({ n: 100000 }).transactions.length).toBe(100000);
  });

  it("transaction ids are unique", () => {
    expect(new Set(DATASET.transactions.map((t) => t.id)).size).toBe(7000);
  });
});

describe("fixture: coverage", () => {
  it("covers both CAD and USD in accounts and transactions", () => {
    expect(new Set(DATASET.accounts.map((a) => a.currency))).toEqual(new Set(["CAD", "USD"]));
    expect(new Set(DATASET.transactions.map((t) => t.currency))).toEqual(new Set(["CAD", "USD"]));
  });

  it("covers archived, invisible and investment-flagged accounts that carry transactions", () => {
    const withTx = new Set(DATASET.transactions.map((t) => t.accountId));
    expect(DATASET.accounts.filter((a) => a.archived && withTx.has(a.id)).length).toBeGreaterThan(0);
    expect(DATASET.accounts.filter((a) => a.invisible && withTx.has(a.id)).length).toBeGreaterThan(0);
    expect(DATASET.accounts.filter((a) => a.isInvestment && withTx.has(a.id)).length).toBeGreaterThan(0);
  });

  it("covers account types A and L", () => {
    expect(new Set(DATASET.accounts.map((a) => a.type))).toEqual(new Set(["A", "L"]));
  });

  it("covers category types E, I and R with groups", () => {
    expect(new Set(DATASET.categories.map((c) => c.type))).toEqual(new Set(["E", "I", "R"]));
    expect(DATASET.categories.every((c) => c.group.length > 0)).toBe(true);
  });

  it("has null-category rows at a 3-15% rate", () => {
    const nulls = DATASET.transactions.filter((t) => t.categoryId === null).length;
    expect(nulls / 7000).toBeGreaterThanOrEqual(0.03);
    expect(nulls / 7000).toBeLessThanOrEqual(0.15);
  });

  it("amounts have at most 2 decimals", () => {
    for (const t of DATASET.transactions) {
      expect(Math.abs(t.amount * 100 - Math.round(t.amount * 100))).toBeLessThan(1e-7);
    }
  });

  it("dates are YYYY-MM-DD across a 3-year span", () => {
    const dates = DATASET.transactions.map((t) => t.date);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    const sorted = [...dates].sort();
    expect(sorted[0].slice(0, 4)).toBe("2024");
    expect(sorted[sorted.length - 1].slice(0, 4)).toBe("2026");
    const spanDays = (Date.parse(sorted[sorted.length - 1]) - Date.parse(sorted[0])) / 86400000;
    expect(spanDays).toBeGreaterThanOrEqual(1090);
    expect(spanDays).toBeLessThanOrEqual(1095);
  });
});

describe("fixture: reference queries", () => {
  it("default balances exclude archived and invisible accounts (server semantics)", () => {
    const ids = accountBalances(DATASET).map((r) => r.accountId);
    const archivedIds = DATASET.accounts.filter((a) => a.archived).map((a) => a.id);
    const invisibleIds = DATASET.accounts.filter((a) => a.invisible).map((a) => a.id);
    for (const id of [...archivedIds, ...invisibleIds]) expect(ids).not.toContain(id);
    expect(ids.length).toBe(DATASET.accounts.length - archivedIds.length - invisibleIds.length);
  });

  it("account balances agree with the naive recomputation for 4 option combos", () => {
    for (const opts of [
      { includeArchived: false, includeInvisible: false },
      { includeArchived: true, includeInvisible: false },
      { includeArchived: false, includeInvisible: true },
      { includeArchived: true, includeInvisible: true },
    ]) {
      const ref = accountBalances(DATASET, opts);
      const naive = naiveBalances(DATASET, opts);
      expect(new Set(ref.map((r) => r.accountId))).toEqual(new Set(Object.keys(naive)));
      for (const r of ref) expect(cents(r.balance)).toBe(cents(naive[r.accountId]));
    }
  });

  it("category totals (type E) agree with the naive recomputation for 3 random windows", () => {
    for (const w of WINDOWS) {
      const ref = categoryTotalsE(DATASET, w);
      const naive = naiveCategoryE(DATASET, w);
      expect(new Set(ref.map((r) => r.categoryId))).toEqual(new Set(Object.keys(naive)));
      for (const r of ref) expect(cents(r.total)).toBe(cents(naive[r.categoryId]));
    }
  });

  it("income vs expenses agree with the naive recomputation for 3 random windows", () => {
    for (const w of WINDOWS) {
      const ref = incomeVsExpenses(DATASET, w);
      const naive = naiveIncomeExpense(DATASET, w);
      const refKeys = ref.map((r) => `${r.month}|${r.type}|${r.currency}`);
      expect(new Set(refKeys)).toEqual(new Set(Object.keys(naive)));
      for (const r of ref) expect(cents(r.total)).toBe(cents(naive[`${r.month}|${r.type}|${r.currency}`]));
    }
  });

  it("hero net worth agrees with the naive recomputation (CAD display, fixed rate map)", () => {
    const h = heroNetWorth(DATASET);
    const n = naiveHero(DATASET);
    expect(h.displayCurrency).toBe("CAD");
    expect(cents(h.totalAssets)).toBe(cents(n.assets));
    expect(cents(h.totalLiabilities)).toBe(cents(n.liabs));
    expect(cents(h.netWorth)).toBe(cents(n.net));
  });

  it("last month of net worth by month equals hero net worth", () => {
    const series = netWorthByMonth(DATASET);
    const last = series[series.length - 1];
    const h = heroNetWorth(DATASET);
    expect(cents(last.netWorth)).toBe(cents(h.netWorth));
  });
});
