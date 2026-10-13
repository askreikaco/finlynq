import { monthsBetween, shiftMonth, type MonthPoint } from "./period";

/**
 * Builders that turn data a page already loaded into the monthly series the shared metric cards use
 * (resolveCard / computeCardMetric in ./period + ./delta). Pure; no React. A builder returns [] when there is no
 * data at all: a card with no series shows its value only, never a made-up chart.
 */

const monthOf = (date: string): string => date.slice(0, 7);
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Carry a stock series forward (balance on a month with no change = the previous month's), through `throughMonth`. */
export function fillForward(points: readonly MonthPoint[], throughMonth?: string): MonthPoint[] {
  const sorted = [...points].filter((p) => MONTH_RE.test(p.month) && Number.isFinite(p.value)).sort((a, b) => a.month.localeCompare(b.month));
  if (sorted.length === 0) return [];
  const byMonth = new Map(sorted.map((p) => [p.month, p.value]));
  const end = throughMonth && throughMonth > sorted[sorted.length - 1].month ? throughMonth : sorted[sorted.length - 1].month;
  const out: MonthPoint[] = [];
  let last = sorted[0].value;
  for (const m of monthsBetween(sorted[0].month, end)) {
    if (byMonth.has(m)) last = byMonth.get(m)!;
    out.push({ month: m, value: last });
  }
  return out;
}

/** Dated balances (value = balance on that date) -> month-end balance per month, carried forward through `throughMonth`. */
export function monthEndBalances(points: ReadonlyArray<{ date: string; value: number }> | null | undefined, throughMonth?: string): MonthPoint[] {
  const sorted = [...(points ?? [])]
    .filter((p) => typeof p.date === "string" && p.date.length >= 7 && Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = new Map<string, number>();
  for (const p of sorted) byMonth.set(monthOf(p.date), p.value);
  return fillForward(Array.from(byMonth, ([month, value]) => ({ month, value })), throughMonth);
}

/** Per-month DELTAS (as /api/dashboard's *OverTime rows) -> running total per month, carried forward through `throughMonth`. */
export function runningTotal(rows: ReadonlyArray<{ month: string; cumulative: number }> | null | undefined, throughMonth?: string): MonthPoint[] {
  const byMonth = new Map<string, number>();
  let running = 0;
  for (const r of rows ?? []) {
    running += r.cumulative;
    byMonth.set(r.month, running);
  }
  return fillForward(Array.from(byMonth, ([month, value]) => ({ month, value })), throughMonth);
}

/**
 * Flow per month (sum of `value` over the rows of that month). Months between the first and last row with no rows
 * are real zeros (the list is complete), so the series is dense through `throughMonth` when given.
 */
export function sumByMonth<T>(
  items: readonly T[] | null | undefined,
  dateOf: (item: T) => string | null | undefined,
  valueOf: (item: T) => number,
  throughMonth?: string,
  fromMonth?: string,
): MonthPoint[] {
  const byMonth = new Map<string, number>();
  for (const it of items ?? []) {
    const d = dateOf(it);
    const v = valueOf(it);
    if (!d || d.length < 7 || !Number.isFinite(v)) continue;
    const m = monthOf(d);
    byMonth.set(m, (byMonth.get(m) ?? 0) + v);
  }
  const months = Array.from(byMonth.keys()).sort();
  if (months.length === 0) return [];
  const end = throughMonth && throughMonth > months[months.length - 1] ? throughMonth : months[months.length - 1];
  // `fromMonth`: the list is known to be complete from there on (e.g. a tax-year filter), so earlier empty months are real zeros.
  const start = fromMonth && fromMonth < months[0] ? fromMonth : months[0];
  return monthsBetween(start, end).map((month) => ({ month, value: Math.round((byMonth.get(month) ?? 0) * 100) / 100 }));
}

/** Count of rows per month (same density rule as sumByMonth). */
export function countByMonth<T>(
  items: readonly T[] | null | undefined,
  dateOf: (item: T) => string | null | undefined,
  throughMonth?: string,
  fromMonth?: string,
): MonthPoint[] {
  return sumByMonth(items, dateOf, () => 1, throughMonth, fromMonth);
}

/** Running total of a (dense) flow series: the lifetime figure at each month end. */
export function cumulate(points: readonly MonthPoint[]): MonthPoint[] {
  let running = 0;
  return [...points]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((p) => ({ month: p.month, value: Math.round((running += p.value) * 100) / 100 }));
}

/** The latest point at or before `month` (0 before the series starts, e.g. a lifetime total before the first row). */
export function valueAt(points: readonly MonthPoint[], month: string): number {
  let v = 0;
  for (const p of points) if (p.month <= month) v = p.value; else break;
  return v;
}

/**
 * Stock over time from dated events: each event adds `valueOf` from its date on (an opening balance, a purchase),
 * optionally removed again at `endOf`. Dense from the first event through `throughMonth`.
 */
export function stockFromEvents<T>(
  items: readonly T[] | null | undefined,
  startOf: (item: T) => string | null | undefined,
  valueOf: (item: T) => number,
  endOf?: (item: T) => string | null | undefined,
  throughMonth?: string,
): MonthPoint[] {
  const starts = (items ?? []).map((i) => startOf(i)).filter((d): d is string => !!d && d.length >= 7).map(monthOf).sort();
  if (starts.length === 0) return [];
  const end = throughMonth && throughMonth > starts[starts.length - 1] ? throughMonth : starts[starts.length - 1];
  return monthsBetween(starts[0], end).map((month) => {
    let total = 0;
    for (const it of items ?? []) {
      const s = startOf(it);
      if (!s || monthOf(s) > month) continue;
      const e = endOf?.(it);
      if (e && monthOf(e) <= month) continue;
      total += valueOf(it);
    }
    return { month, value: Math.round(total * 100) / 100 };
  });
}

/** Ratio series (e.g. savings rate %): per month num/den*100 where den > 0; months without a denominator are skipped. */
export function ratioSeries(num: readonly MonthPoint[], den: readonly MonthPoint[], scale = 100): MonthPoint[] {
  const d = new Map(den.map((p) => [p.month, p.value]));
  const out: MonthPoint[] = [];
  for (const p of [...num].sort((a, b) => a.month.localeCompare(b.month))) {
    const dv = d.get(p.month);
    if (dv != null && dv > 0) out.push({ month: p.month, value: Math.round((p.value / dv) * scale * 10) / 10 });
  }
  return out;
}

/** Month of a "YYYY-MM-DD" (or "YYYY-MM") date; the `throughMonth` argument of every builder is usually this of "today". */
export const throughMonthOf = (today: string): string => monthOf(today);
export { shiftMonth };

import type { MetricCardProps } from "@/components/metric-card";
import { aggregate, compareCaption, pctChange, previousPeriod, type Period, type RangeSelection } from "./period";
import { formatDelta, resolveCard, type DeltaKind, type ResolvedCard } from "./delta";

/**
 * Bind the page's selected range once, get a resolver per card:
 *   const card = makeCardResolver({ selection, explicit, period }, currency);
 *   const c = card(points, "last", pageValue);                 // money, badge + "+$X vs last month" + sparkline
 *   <MetricCard value={c.value ?? pageValue} {...cardProps(c)} />
 * `pageValue` is the figure the page computes itself (the big number for the default period).
 */
export function makeCardResolver(
  range: { selection: RangeSelection; explicit: boolean; period: Period },
  currency?: string,
) {
  const caption = compareCaption(range.selection);
  return (
    points: readonly MonthPoint[] | null | undefined,
    mode: "sum" | "last",
    pageValue?: number | null,
    kind: DeltaKind = "money",
  ): ResolvedCard =>
    resolveCard({ points: points ? [...points] : null, period: range.period, mode, isDefault: !range.explicit, pageValue, kind, currency, caption });
}

/** The card props every MetricCard / MetricItem takes from a ResolvedCard (delta line as `sub`, badge, sparkline). */
export function cardProps(c: ResolvedCard): Pick<MetricCardProps, "sub" | "badgePct" | "sparkData" | "sparkLabels"> {
  return {
    ...(c.delta ? { sub: c.delta } : {}),
    badgePct: c.badgePct,
    ...(c.sparkData ? { sparkData: c.sparkData, sparkLabels: c.sparkLabels } : {}),
  };
}

/**
 * A rate card (savings rate: net / income as a percent) from two monthly flow series. The value, the badge, the
 * "+x pp" delta and the sparkline all use the SAME basis: the rate of the period's summed numerator over its summed
 * denominator, against the previous period's. `value` is the percent (one decimal), null when the denominator is 0.
 */
export function resolveRatioCard(opts: {
  num: readonly MonthPoint[];
  den: readonly MonthPoint[];
  period: Period;
  caption: string;
  sparkMonths?: number;
}): ResolvedCard {
  const { num, den, period, caption } = opts;
  const rateOf = (months: string[]): number | null => {
    const n = aggregate([...num], months, "sum");
    const d = aggregate([...den], months, "sum");
    return n != null && d != null && d > 0 ? (n / d) * 100 : null;
  };
  const cur = rateOf(period.months);
  const prev = rateOf(previousPeriod(period).months);
  const end = period.months[period.months.length - 1];
  const spark = ratioSeries(num.filter((p) => p.month <= end), den).slice(-(opts.sparkMonths ?? 6));
  return {
    value: cur != null ? Math.round(cur * 10) / 10 : null,
    badgePct: pctChange(cur, prev),
    delta: formatDelta({ cur, prev, kind: "pp", caption }),
    ...(spark.length >= 2 ? { sparkData: spark.map((p) => p.value), sparkLabels: spark.map((p) => p.month) } : {}),
  };
}
