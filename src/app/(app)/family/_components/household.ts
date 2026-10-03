import type { MemberDto } from "./types";

export type ExcludeReason = "not_shared" | "partial" | "unavailable";

type Excluded = Array<{ id: string; name: string; reason: ExcludeReason }>;

export interface Point {
  date: string;
  value: number;
}

export interface HouseholdTotals {
  /** null when no member qualifies (never shown as 0) */
  net: number | null;
  assets: number | null;
  liabilities: number | null;
  /** summed net-worth history of the included members (carry-forward per member) */
  history: Point[];
  included: number;
  excluded: Excluded;
}

/** Why a member's section can't count toward a household figure (null = it can). */
function exclusion(m: MemberDto, section: "net_worth" | "cashflow"): ExcludeReason | null {
  if (m.error || m.unavailable.includes(section)) return "unavailable";
  if (m.notShared.includes(section) || !(section in m.sections) || m.sections[section] == null) return "not_shared";
  if (m.partial) return "partial";
  return null;
}

/**
 * Combined totals in the viewer's display currency. Only members that share net worth with
 * complete data count: a member without the net_worth section (notShared), with a failed section
 * or whole member, or flagged partial (missing rate / unpriced / section error) is EXCLUDED and
 * reported, so the total never silently under-counts or treats "not shared" as zero.
 */
export function computeHousehold(members: MemberDto[]): HouseholdTotals {
  let net = 0;
  let assets = 0;
  let liabilities = 0;
  let included = 0;
  const excluded: Excluded = [];
  const histories: Point[][] = [];
  for (const m of members) {
    const reason = exclusion(m, "net_worth");
    const nw = m.sections.net_worth;
    if (reason || !nw) {
      excluded.push({ id: m.id, name: m.name, reason: reason ?? "not_shared" });
      continue;
    }
    net += nw.net;
    assets += nw.assets;
    liabilities += nw.liabilities;
    histories.push(nw.history);
    included += 1;
  }
  return included === 0
    ? { net: null, assets: null, liabilities: null, history: [], included, excluded }
    : { net, assets, liabilities, history: sumSeries(histories), included, excluded };
}

/**
 * Sum several date series into one: on every date present in any series, each series contributes
 * its latest value on or before that date (0 before its first point).
 */
export function sumSeries(series: Point[][]): Point[] {
  const dates = [...new Set(series.flatMap((s) => s.map((p) => p.date)))].sort();
  const sorted = series.map((s) => [...s].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")));
  const idx = sorted.map(() => -1);
  return dates.map((date) => {
    let value = 0;
    sorted.forEach((s, i) => {
      while (idx[i] + 1 < s.length && s[idx[i] + 1].date <= date) idx[i] += 1;
      if (idx[i] >= 0) value += s[idx[i]].value;
    });
    return { date, value: Math.round(value * 100) / 100 };
  });
}

/** Change over a series (last vs first point) and its % of |first|; null with fewer than 2 points. */
export function seriesChange(history: Point[]): { change: number | null; pct: number } {
  if (history.length < 2) return { change: null, pct: 0 };
  const first = history[0].value;
  const change = history[history.length - 1].value - first;
  return { change, pct: first !== 0 ? (change / Math.abs(first)) * 100 : 0 };
}

/** The dashboard's savings-rate formula: round((income - expenses) / income * 100), null without income. */
export function savingsRate(income: number, expenses: number): number | null {
  return income > 0 ? Math.round(((income - expenses) / income) * 100) : null;
}

type Flow = { income: number; expenses: number };

function sumFlows<K extends string>(rows: Array<Array<Flow & Record<K, string>>>, key: K): Array<Flow & Record<K, string>> {
  const map = new Map<string, Flow>();
  for (const list of rows) {
    for (const r of list) {
      const cur = map.get(r[key]) ?? { income: 0, expenses: 0 };
      cur.income += r.income;
      cur.expenses += r.expenses;
      map.set(r[key], cur);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""))
    .map(([k, v]) => ({ [key]: k, income: Math.round(v.income * 100) / 100, expenses: Math.round(v.expenses * 100) / 100 }) as Flow & Record<K, string>);
}

export interface HouseholdFlows {
  /** null when no member qualifies */
  income: number | null;
  expenses: number | null;
  /** savings rate recomputed from the summed savings inputs (never an average of rates) */
  savingsRatePct: number | null;
  monthly: Array<{ month: string; income: number; expenses: number }>;
  daily: Array<{ date: string; income: number; expenses: number }>;
  from: string | null;
  included: number;
  excluded: Excluded;
  /** debt-to-income from summed debt service / summed 12-month income; null = no qualifying member */
  dti: { pct: number | null; reliable: boolean } | null;
  dtiIncluded: number;
  dtiExcluded: Excluded;
}

/**
 * Household income / expenses / savings rate / debt-to-income, with the same exclusion rule as
 * net worth: a member counts only when the needed sections are shared with complete data.
 * Debt-to-income needs cashflow AND loans (the member's cashflow.debtToIncome is non-null).
 */
export function computeHouseholdFlows(members: MemberDto[]): HouseholdFlows {
  let income = 0;
  let expenses = 0;
  let sIncome = 0;
  let sExpenses = 0;
  let debt = 0;
  let income12m = 0;
  let reliable = true;
  let included = 0;
  let dtiIncluded = 0;
  let from: string | null = null;
  const excluded: Excluded = [];
  const dtiExcluded: Excluded = [];
  const monthly: Array<Array<{ month: string } & Flow>> = [];
  const daily: Array<Array<{ date: string } & Flow>> = [];
  for (const m of members) {
    const reason = exclusion(m, "cashflow");
    const cf = m.sections.cashflow;
    if (reason || !cf) {
      excluded.push({ id: m.id, name: m.name, reason: reason ?? "not_shared" });
      dtiExcluded.push({ id: m.id, name: m.name, reason: reason ?? "not_shared" });
      continue;
    }
    income += cf.income;
    expenses += cf.expenses;
    sIncome += cf.savings.income;
    sExpenses += cf.savings.expenses;
    monthly.push(cf.monthly);
    daily.push(cf.daily);
    if (cf.from && (!from || cf.from < from)) from = cf.from;
    included += 1;

    // debtToIncome is only built when the member also grants loans (null = not shared)
    if (!cf.debtToIncome) {
      dtiExcluded.push({ id: m.id, name: m.name, reason: "not_shared" });
      continue;
    }
    debt += cf.debtToIncome.debtPayments12m;
    income12m += cf.debtToIncome.income12m;
    reliable &&= cf.debtToIncome.reliable;
    dtiIncluded += 1;
  }
  return {
    income: included ? Math.round(income * 100) / 100 : null,
    expenses: included ? Math.round(expenses * 100) / 100 : null,
    savingsRatePct: included ? savingsRate(sIncome, sExpenses) : null,
    monthly: sumFlows(monthly, "month"),
    daily: sumFlows(daily, "date"),
    from,
    included,
    excluded,
    dti: dtiIncluded ? { pct: income12m > 0 ? Math.round((debt / income12m) * 100) : null, reliable } : null,
    dtiIncluded,
    dtiExcluded,
  };
}
