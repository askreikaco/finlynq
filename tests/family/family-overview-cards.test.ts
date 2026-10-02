/**
 * Family overview: dashboard / reports / portfolio cards (2026-10). Pure + mocked-data tests, no DB:
 *  - the allow-list serializer carries the new fields and still strips everything else;
 *  - builders: range helpers, savings rate / DTI formulas, DTI gated on `loans`, performance in the
 *    viewer currency (never 1:1), month-to-date daily series;
 *  - assemble: hidden sections (accounts / goals / budgets) are never built, sent or listed;
 *  - household sums and the checklist registry lists.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rq = vi.hoisted(() => ({
  getIncomeVsExpenses: vi.fn(),
  getIncomeVsExpensesDaily: vi.fn(),
  getOwnerLoans: vi.fn(),
  getOwnerUntrackedLiabilities: vi.fn(),
  getOwnerPortfolioPerformance: vi.fn(),
  getOwnerAccountBalances: vi.fn(),
  getInvestmentSnapshotsInRange: vi.fn(),
}));
vi.mock("@/lib/family/read-queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/family/read-queries")>()),
  ...rq,
}));

import {
  FAMILY_HIDDEN_SECTIONS,
  FAMILY_OVERVIEW_SECTIONS,
  FAMILY_SECTIONS_V1,
  isOverviewSection,
} from "@/lib/family/sections";
import { serializeOverview, OVERVIEW_PERIODS } from "@/lib/family/overview/dto";
import {
  buildCashflow,
  buildInvestments,
  downsample,
  dtiPct,
  historyWindow,
  monthsSpanned,
  performancePeriodKey,
  rangeStart,
  savingsRatePct,
  type MemberCtx,
} from "@/lib/family/overview/builders";
import type { FxContext } from "@/lib/family/overview/fx";
import type { FamilySection } from "@/lib/family/sections";
import {
  computeHousehold,
  computeHouseholdFlows,
  seriesChange,
  sumSeries,
} from "@/app/(app)/family/_components/household";
import type { MemberDto } from "@/app/(app)/family/_components/types";

// ─── helpers ──────────────────────────────────────────────────────────────────────────────────

/** Minimal viewer-currency context: USD display, EUR at 1.25, everything else unresolved. */
function fakeFx(): FxContext {
  const rates = new Map<string, number>([["USD", 1], ["EUR", 1.25]]);
  return {
    display: "USD",
    map: rates,
    prepare: async () => {},
    rate: (c: string | null | undefined) => rates.get((c ?? "USD").toUpperCase()) ?? null,
    cross: () => null,
    convert: (a: number | null | undefined, c: string | null | undefined) => {
      if (a == null) return null;
      const r = rates.get((c ?? "USD").toUpperCase());
      return r == null ? null : Math.round(a * r * 100) / 100;
    },
  } as unknown as FxContext;
}

function ctx(o: Partial<MemberCtx> = {}): MemberCtx {
  return {
    ownerId: "owner-1",
    fx: fakeFx(),
    today: "2026-10-15",
    period: "month",
    granted: ["cashflow"],
    labels: new Map(),
    partial: new Set(),
    generic: { used: false },
    memo: {},
    ...o,
  };
}

const slice = (month: string, type: "I" | "E", amount: number, currency = "USD") => ({
  month,
  type,
  currency,
  reportingCurrency: null,
  totalAmount: amount,
  totalReporting: null,
});

beforeEach(() => {
  for (const f of Object.values(rq)) f.mockReset();
  rq.getIncomeVsExpensesDaily.mockResolvedValue([]);
  rq.getOwnerLoans.mockResolvedValue([]);
  rq.getOwnerUntrackedLiabilities.mockResolvedValue([]);
  rq.getOwnerAccountBalances.mockResolvedValue([]);
  rq.getInvestmentSnapshotsInRange.mockResolvedValue([]);
});

// ─── registry ─────────────────────────────────────────────────────────────────────────────────

describe("sections shown on the overview", () => {
  it("accounts / goals / budgets are retired from the overview but stay in the registry", () => {
    expect([...FAMILY_HIDDEN_SECTIONS].sort()).toEqual(["accounts", "budgets", "goals"]);
    expect([...FAMILY_OVERVIEW_SECTIONS]).toEqual(["net_worth", "investments", "loans", "cashflow"]);
    for (const s of FAMILY_HIDDEN_SECTIONS) {
      expect(FAMILY_SECTIONS_V1).toContain(s); // existing grants + CHECK constraints stay valid
      expect(isOverviewSection(s)).toBe(false);
    }
  });
});

// ─── DTO allow-list ───────────────────────────────────────────────────────────────────────────

const cashflowDto = {
  from: "2026-10-01",
  windowMonths: 1,
  income: 3000,
  expenses: 1200,
  monthly: [{ month: "2026-10", income: 3000, expenses: 1200, categoryId: 7 }],
  daily: [{ date: "2026-10-01", income: 3000, expenses: 0, payee: "Employer Inc" }],
  savings: { income: 3000, expenses: 1200, ratePct: 60, raw: [1, 2] },
  debtToIncome: { pct: 25, reliable: true, debtPayments12m: 9000, income12m: 36000, loanIds: [3] },
  extra: "x",
};
const investmentsDto = {
  holdingsValue: 900,
  asOf: "2026-09-30",
  accountsPriced: 1,
  accountsUnpriced: 0,
  holdings: [{ ref: "h1", label: "Secret ETF", symbol: "SECR" }],
  performance: {
    from: "2026-10-01",
    to: "2026-10-15",
    series: [{ date: "2026-10-01", marketValue: 900, costBasis: 700, currency: "EUR", accountId: 12 }],
    twrr: { period: 0.05, annualized: 0.6, hadContributions: true },
    mwrr: { irr: 0.04, converged: true },
    gapsFilledDays: 0,
    userId: "owner-1",
  },
};
const body = (period: string) => ({
  displayCurrency: "USD",
  period,
  asOf: "2026-10-15",
  partial: false,
  members: [
    {
      id: "me",
      relation: "me",
      name: "Me",
      sections: {
        cashflow: cashflowDto,
        investments: investmentsDto,
        accounts_extra: { a: 1 },
      },
      notShared: [],
      unavailable: [],
      partial: false,
      partialReasons: [],
      genericLabels: false,
    },
  ],
});

describe("overview DTO (allow-list serializer)", () => {
  it("serializes the new card fields and strips unknown keys at every level", () => {
    const out = serializeOverview(body("month"));
    const m = out.members[0];
    expect(m.sections.cashflow).toEqual({
      from: "2026-10-01",
      windowMonths: 1,
      income: 3000,
      expenses: 1200,
      monthly: [{ month: "2026-10", income: 3000, expenses: 1200 }],
      daily: [{ date: "2026-10-01", income: 3000, expenses: 0 }],
      savings: { income: 3000, expenses: 1200, ratePct: 60 },
      debtToIncome: { pct: 25, reliable: true, debtPayments12m: 9000, income12m: 36000 },
    });
    expect(m.sections.investments).toEqual({
      holdingsValue: 900,
      asOf: "2026-09-30",
      accountsPriced: 1,
      accountsUnpriced: 0,
      performance: {
        from: "2026-10-01",
        to: "2026-10-15",
        series: [{ date: "2026-10-01", marketValue: 900, costBasis: 700 }],
        twrr: { period: 0.05, annualized: 0.6 },
        mwrr: { irr: 0.04, converged: true },
        gapsFilledDays: 0,
      },
    });
    const text = JSON.stringify(out);
    for (const leak of ["Secret ETF", "SECR", "symbol", '"holdings"', "accountId", "loanIds", "userId", "owner-1", "payee", "Employer", "categoryId", "accounts_extra"]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("DTI is nullable (member does not also share loans); savings rate may be null", () => {
    const b = body("month");
    b.members[0].sections.cashflow = { ...cashflowDto, debtToIncome: null, savings: { income: 0, expenses: 10, ratePct: null } } as never;
    const out = serializeOverview(b);
    expect(out.members[0].sections.cashflow?.debtToIncome).toBeNull();
    expect(out.members[0].sections.cashflow?.savings.ratePct).toBeNull();
  });

  it("accepts month / year / all and the legacy 6m / 1y; rejects anything else", () => {
    expect([...OVERVIEW_PERIODS]).toEqual(["month", "year", "all", "6m", "1y"]);
    for (const p of OVERVIEW_PERIODS) expect(serializeOverview(body(p)).period).toBe(p);
    expect(() => serializeOverview(body("5y"))).toThrow();
  });
});

// ─── pure builder helpers ─────────────────────────────────────────────────────────────────────

describe("range helpers and formulas", () => {
  it("rangeStart: month-to-date, year-to-date, calendar-aligned legacy windows, all = null", () => {
    expect(rangeStart("month", "2026-10-15")).toBe("2026-10-01");
    expect(rangeStart("year", "2026-10-15")).toBe("2026-01-01");
    expect(rangeStart("6m", "2026-03-15")).toBe("2025-10-01");
    expect(rangeStart("1y", "2026-10-15")).toBe("2025-11-01");
    expect(rangeStart("all", "2026-10-15")).toBeNull();
  });

  it("historyWindow / performancePeriodKey map the ranges onto the existing engines", () => {
    expect(historyWindow("month", "2026-10-15")).toEqual({ period: "1y", firstDay: "2026-10-01" });
    expect(historyWindow("year", "2026-10-15")).toEqual({ period: "1y", firstDay: "2026-01-01" });
    expect(historyWindow("all", "2026-10-15")).toEqual({ period: "all" });
    expect(historyWindow("6m", "2026-10-15")).toEqual({ period: "6m" });
    expect(performancePeriodKey("month")).toBe("mtd");
    expect(performancePeriodKey("year")).toBe("ytd");
    expect(performancePeriodKey("all")).toBe("all");
    expect(performancePeriodKey("1y")).toBe("1y");
  });

  it("monthsSpanned and downsample", () => {
    expect(monthsSpanned("2026-10-01", "2026-10-15")).toBe(1);
    expect(monthsSpanned("2026-01-01", "2026-10-15")).toBe(10);
    expect(monthsSpanned("2025-11-01", "2026-10-15")).toBe(12);
    const pts = Array.from({ length: 1000 }, (_, i) => i);
    const d = downsample(pts, 400);
    expect(d).toHaveLength(400);
    expect(d[0]).toBe(0);
    expect(d[d.length - 1]).toBe(999);
    expect(downsample([1, 2, 3], 400)).toEqual([1, 2, 3]);
  });

  it("savings rate and DTI use the dashboard's exact formulas (financial-health.ts)", () => {
    expect(savingsRatePct(3000, 1200)).toBe(60);
    expect(savingsRatePct(1000, 1500)).toBe(-50);
    expect(savingsRatePct(0, 100)).toBeNull();
    expect(dtiPct(9000, 36000)).toBe(25);
    expect(dtiPct(100, 0)).toBeNull();
  });
});

// ─── builders with mocked read queries ────────────────────────────────────────────────────────

describe("buildCashflow", () => {
  it("range totals, monthly + daily (month-to-date), savings with |expense slices|", async () => {
    rq.getIncomeVsExpenses.mockResolvedValue([
      slice("2026-10", "I", 3000),
      slice("2026-10", "E", -1000),
      slice("2026-10", "E", 200), // refund slice: savings uses |slice| like the dashboard
      slice("2026-10", "E", -100, "EUR"),
    ]);
    rq.getIncomeVsExpensesDaily.mockResolvedValue([
      { day: "2026-10-01", type: "I", currency: "USD", reportingCurrency: null, totalAmount: 3000, totalReporting: null },
      { day: "2026-10-02", type: "E", currency: "USD", reportingCurrency: null, totalAmount: -800, totalReporting: null },
    ]);
    const c = ctx();
    const cf = await buildCashflow(c);
    expect(rq.getIncomeVsExpenses).toHaveBeenCalledWith("owner-1", "2026-10-01", "2026-10-31");
    expect(cf.from).toBe("2026-10-01");
    expect(cf.windowMonths).toBe(1);
    expect(cf.income).toBe(3000);
    expect(cf.expenses).toBe(1000 - 200 + 125);
    expect(cf.monthly).toEqual([{ month: "2026-10", income: 3000, expenses: 925 }]);
    expect(cf.daily).toEqual([
      { date: "2026-10-01", income: 3000, expenses: 0 },
      { date: "2026-10-02", income: 0, expenses: 800 },
    ]);
    expect(cf.savings).toEqual({ income: 3000, expenses: 1325, ratePct: savingsRatePct(3000, 1325) });
    expect(c.partial.size).toBe(0);
  });

  it("year / all ranges: no daily query; all time starts at the first month with data", async () => {
    rq.getIncomeVsExpenses.mockResolvedValue([slice("2024-03", "I", 10), slice("2026-10", "I", 20)]);
    const all = await buildCashflow(ctx({ period: "all" }));
    expect(rq.getIncomeVsExpensesDaily).not.toHaveBeenCalled();
    expect(all.from).toBeNull();
    expect(all.daily).toEqual([]);
    expect(all.windowMonths).toBe(monthsSpanned("2024-03-01", "2026-10-15"));
    const year = await buildCashflow(ctx({ period: "year" }));
    expect(rq.getIncomeVsExpenses).toHaveBeenLastCalledWith("owner-1", "2026-01-01", "2026-10-31");
    expect(year.from).toBe("2026-01-01");
  });

  it("a slice without a resolvable rate is excluded + partial, never counted 1:1", async () => {
    rq.getIncomeVsExpenses.mockResolvedValue([slice("2026-10", "I", 3000), slice("2026-10", "I", 777_777, "ZZZ")]);
    const c = ctx();
    const cf = await buildCashflow(c);
    expect(cf.income).toBe(3000);
    expect(c.partial.has("fx_rate_missing")).toBe(true);
  });

  it("DTI is never computed without the loans grant (null = not shared, no loan queries)", async () => {
    rq.getIncomeVsExpenses.mockResolvedValue([slice("2026-10", "I", 3000)]);
    const cf = await buildCashflow(ctx({ granted: ["cashflow"] }));
    expect(cf.debtToIncome).toBeNull();
    expect(rq.getOwnerLoans).not.toHaveBeenCalled();
    expect(rq.getOwnerUntrackedLiabilities).not.toHaveBeenCalled();
  });

  it("with loans granted: trailing-12m debt service / trailing-12m income (dashboard formula)", async () => {
    rq.getIncomeVsExpenses.mockImplementation(async (_o: string, start: string) =>
      start === "2025-10-15"
        ? [slice("2026-01", "I", 24000), slice("2026-09", "I", 12000), slice("2026-09", "E", -5000)]
        : [slice("2026-10", "I", 3000)],
    );
    rq.getOwnerUntrackedLiabilities.mockResolvedValue([
      // a card carrying debt: payments below the balance carried are counted in full
      { accountId: 9, currency: "USD", payments: [{ currency: "USD", total: 9000 }], owedAtWindowStart: 20000, owedAtWindowEnd: 15000 },
    ]);
    const cf = await buildCashflow(ctx({ granted: ["cashflow", "loans"] }));
    expect(rq.getOwnerUntrackedLiabilities).toHaveBeenCalledWith("owner-1", "2025-10-15", "2026-10-15");
    expect(cf.debtToIncome).toEqual({ pct: 25, reliable: true, debtPayments12m: 9000, income12m: 36000 });
  });

  it("DTI with an unresolvable debt currency: pct null + partial (never 1:1)", async () => {
    rq.getIncomeVsExpenses.mockResolvedValue([slice("2026-10", "I", 3000)]);
    rq.getOwnerUntrackedLiabilities.mockResolvedValue([
      { accountId: 9, currency: "ZZZ", payments: [{ currency: "ZZZ", total: 9000 }], owedAtWindowStart: 20000, owedAtWindowEnd: 15000 },
    ]);
    const c = ctx({ granted: ["cashflow", "loans"] });
    const cf = await buildCashflow(c);
    expect(cf.debtToIncome?.pct).toBeNull();
    expect(c.partial.has("fx_rate_missing")).toBe(true);
  });
});

describe("buildInvestments (Performance card)", () => {
  const perf = (series: Array<{ date: string; marketValue: number; costBasis: number; currency: string }>) => ({
    period: "mtd",
    accountId: null,
    from: "2026-10-01",
    to: "2026-10-15",
    currency: "USD",
    series: series.map((p) => ({ ...p, contribution: 0, gapsFilled: false })),
    twrr: { period: 0.05, annualized: 0.6, hadContributions: false },
    mwrr: { irr: 0.04, converged: true },
    gapsFilledDays: 0,
  });

  it("runs the portfolio performance computation for the owner and converts values to the viewer currency", async () => {
    rq.getOwnerPortfolioPerformance.mockResolvedValue(
      perf([
        { date: "2026-10-01", marketValue: 800, costBasis: 700, currency: "EUR" },
        { date: "2026-10-02", marketValue: 1000, costBasis: 700, currency: "USD" },
      ]),
    );
    const c = ctx({ granted: ["investments"] });
    const inv = await buildInvestments(c);
    expect(rq.getOwnerPortfolioPerformance).toHaveBeenCalledWith("owner-1", "mtd", "2026-10-15");
    expect(inv.performance.series).toEqual([
      { date: "2026-10-01", marketValue: 1000, costBasis: 875 },
      { date: "2026-10-02", marketValue: 1000, costBasis: 700 },
    ]);
    expect(inv.performance.twrr).toEqual({ period: 0.05, annualized: 0.6 });
    expect(inv.performance.mwrr).toEqual({ irr: 0.04, converged: true });
    expect(c.partial.size).toBe(0);
  });

  it("drops a point whose currency has no rate and flags the member partial", async () => {
    rq.getOwnerPortfolioPerformance.mockResolvedValue(
      perf([
        { date: "2026-10-01", marketValue: 800, costBasis: 700, currency: "ZZZ" },
        { date: "2026-10-02", marketValue: 1000, costBasis: 700, currency: "USD" },
      ]),
    );
    const c = ctx({ granted: ["investments"], period: "year" });
    const inv = await buildInvestments(c);
    expect(rq.getOwnerPortfolioPerformance).toHaveBeenCalledWith("owner-1", "ytd", "2026-10-15");
    expect(inv.performance.series).toEqual([{ date: "2026-10-02", marketValue: 1000, costBasis: 700 }]);
    expect(c.partial.has("fx_rate_missing")).toBe(true);
  });
});

// ─── household (client) ───────────────────────────────────────────────────────────────────────

const mem = (o: Partial<MemberDto>): MemberDto => ({
  id: "me",
  relation: "me",
  name: "Me",
  sections: {},
  notShared: [],
  unavailable: [],
  partial: false,
  partialReasons: [],
  genericLabels: false,
  ...o,
});
const cf = (income: number, expenses: number, dti: { debt: number; income12m: number } | null) => ({
  from: "2026-10-01",
  windowMonths: 1,
  income,
  expenses,
  monthly: [{ month: "2026-10", income, expenses }],
  daily: [{ date: "2026-10-01", income, expenses }],
  savings: { income, expenses, ratePct: savingsRatePct(income, expenses) },
  debtToIncome: dti && { pct: dtiPct(dti.debt, dti.income12m), reliable: true, debtPayments12m: dti.debt, income12m: dti.income12m },
});

describe("household figures", () => {
  it("income / expenses sum; savings rate and DTI are recomputed from sums, not averaged", () => {
    const a = mem({ id: "me", sections: { cashflow: cf(3000, 1500, { debt: 6000, income12m: 36000 }) } });
    const b = mem({ id: "s1", relation: "shared", name: "Alice", sections: { cashflow: cf(1000, 900, { debt: 6000, income12m: 12000 }) } });
    const h = computeHouseholdFlows([a, b]);
    expect(h.income).toBe(4000);
    expect(h.expenses).toBe(2400);
    expect(h.savingsRatePct).toBe(40); // (4000-2400)/4000, not avg(50%, 10%) = 30%
    expect(h.dti).toEqual({ pct: 25, reliable: true }); // 12000 / 48000
    expect(h.monthly).toEqual([{ month: "2026-10", income: 4000, expenses: 2400 }]);
  });

  it("members without cashflow / loans or with partial data are excluded and reported", () => {
    const a = mem({ id: "me", sections: { cashflow: cf(3000, 1500, { debt: 6000, income12m: 36000 }) } });
    const noLoans = mem({ id: "s1", relation: "shared", name: "Bob", sections: { cashflow: cf(1000, 500, null) }, notShared: ["loans"] });
    const noCf = mem({ id: "s2", relation: "shared", name: "Cat", notShared: ["cashflow"] });
    const partial = mem({ id: "s3", relation: "shared", name: "Dan", sections: { cashflow: cf(9, 9, null) }, partial: true });
    const h = computeHouseholdFlows([a, noLoans, noCf, partial]);
    expect(h.income).toBe(4000);
    expect(h.excluded).toEqual([
      { id: "s2", name: "Cat", reason: "not_shared" },
      { id: "s3", name: "Dan", reason: "partial" },
    ]);
    expect(h.dti).toEqual({ pct: 17, reliable: true }); // only "me": 6000 / 36000
    expect(h.dtiExcluded.map((e) => e.name)).toEqual(["Bob", "Cat", "Dan"]);
    expect(computeHouseholdFlows([noCf]).income).toBeNull(); // never 0
  });

  it("net worth history sums per date with carry-forward; change = last - first", () => {
    expect(
      sumSeries([
        [{ date: "2026-10-01", value: 100 }, { date: "2026-10-03", value: 150 }],
        [{ date: "2026-10-02", value: 10 }],
      ]),
    ).toEqual([
      { date: "2026-10-01", value: 100 },
      { date: "2026-10-02", value: 110 },
      { date: "2026-10-03", value: 160 },
    ]);
    expect(seriesChange([{ date: "a", value: 200 }, { date: "b", value: 250 }])).toEqual({ change: 50, pct: 25 });
    expect(seriesChange([{ date: "a", value: 1 }]).change).toBeNull();
    const nwm = (net: number) => ({ assets: net, liabilities: 0, net, history: [{ date: "2026-10-01", value: net }], historyFxApproximation: false });
    const t = computeHousehold([mem({ sections: { net_worth: nwm(5) } }), mem({ id: "x", sections: { net_worth: nwm(7) } })]);
    expect(t.net).toBe(12);
    expect(t.history).toEqual([{ date: "2026-10-01", value: 12 }]);
  });
});

// ─── assemble: hidden sections are never built or sent ───────────────────────────────────────

const built = vi.hoisted(() => ({ calls: [] as Array<{ section: string; granted: readonly string[] }> }));
vi.mock("@/lib/family/overview/builders", async (orig) => {
  const actual = await orig<typeof import("@/lib/family/overview/builders")>();
  const spy = (section: string) => async (c: { granted: readonly string[] }) => {
    built.calls.push({ section, granted: c.granted });
    return { section } as never;
  };
  return {
    ...actual,
    SECTION_BUILDERS: Object.fromEntries(
      ["net_worth", "accounts", "investments", "goals", "budgets", "loans", "cashflow"].map((s) => [s, spy(s)]),
    ),
  };
});
vi.mock("@/lib/family/overview/own-labels", () => ({ loadOwnSectionLabels: async () => new Map() }));
vi.mock("@/lib/family/effective-sections", () => ({
  loadLiveChildren: async () => new Map(),
  effectiveSectionsOf: (s: { sections: string[] }) => s.sections,
}));
vi.mock("@/lib/family/grant", () => ({ getUserPrivateKeyHex: async () => null, withSectionKeys: async () => {} }));
vi.mock("@/lib/auth/queries", () => ({ getUserById: async () => ({ displayName: "Alice" }) }));
vi.mock("@/db", () => {
  const chain = { select: () => chain, from: () => chain, where: () => chain, limit: async () => [{ status: "active" }] };
  return { db: chain, schema: {} };
});

describe("assembleFamilyOverview", () => {
  it("builds only overview sections; hidden grants of old shares are ignored (not built, not listed)", async () => {
    const { assembleFamilyOverview } = await import("@/lib/family/overview/assemble");
    built.calls.length = 0;
    const { members } = await assembleFamilyOverview({
      viewerId: "viewer",
      viewerDek: null,
      shares: [
        { id: "share-1", ownerId: "owner", allSections: false, sections: ["accounts", "goals", "cashflow"], mustShareBack: false, requiredBackSections: null },
      ],
      fx: fakeFx(),
      period: "month",
      today: "2026-10-15",
    });
    const [meM, alice] = members;
    expect(Object.keys(meM.sections).sort()).toEqual([...FAMILY_OVERVIEW_SECTIONS].sort());
    expect(meM.notShared).toEqual([]);
    expect(Object.keys(alice.sections)).toEqual(["cashflow"]);
    expect(alice.notShared).toEqual(["net_worth", "investments", "loans"]);
    const builtSections = built.calls.map((c) => c.section);
    for (const hidden of FAMILY_HIDDEN_SECTIONS) expect(builtSections).not.toContain(hidden);
    // cross-section cards see what the member grants (DTI checks `loans`)
    const aliceCashflow = built.calls.filter((c) => c.section === "cashflow")[1];
    expect(aliceCashflow.granted).toEqual(["accounts", "goals", "cashflow"] satisfies FamilySection[]);
  });
});

describe("performance returns that are not finite", () => {
  it("finiteOrNull maps NaN / Infinity to null and keeps real numbers", async () => {
    const { finiteOrNull } = await import("@/lib/family/overview/builders");
    expect(finiteOrNull(NaN)).toBeNull();
    expect(finiteOrNull(Infinity)).toBeNull();
    expect(finiteOrNull(-Infinity)).toBeNull();
    expect(finiteOrNull(0.0123)).toBe(0.0123);
  });

  it("the overview serializer accepts null returns (period=all with a zero starting balance)", async () => {
    const { InvestmentsDtoSchema } = await import("@/lib/family/overview/dto");
    const ok = InvestmentsDtoSchema.safeParse({
      holdingsValue: 1,
      asOf: null,
      accountsPriced: 1,
      accountsUnpriced: 0,
      performance: {
        from: "2024-01-01",
        to: "2026-10-02",
        series: [],
        twrr: { period: 0.1, annualized: null },
        mwrr: { irr: null, converged: false },
        gapsFilledDays: 0,
      },
    });
    expect(ok.success).toBe(true);
  });
});
