/**
 * Pure period math for metric cards (loans / goals / budgets / dashboard).
 *
 * Default = the current calendar month compared with the previous one. Any other range is compared with the
 * immediately preceding period of the SAME length: whole-month ranges shift back by their month count, a custom
 * day range shifts back by its day count. Series are monthly ("YYYY-MM"), so a card aggregates the months a
 * period touches (flows are summed, stocks take the last month).
 */

export const RANGE_KEYS = ["this_month", "last_month", "last_3_months", "last_6_months", "ytd", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
  ytd: "Year to date",
  custom: "Custom range",
};

export type RangeSelection = { range: RangeKey; from?: string; to?: string };

export type Period = {
  /** Inclusive "YYYY-MM-DD". */
  start: string;
  end: string;
  /** Every "YYYY-MM" the period touches, ascending. */
  months: string[];
  /** True when start is a 1st and end is a month's last day (shifts by whole months). */
  monthAligned: boolean;
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");

function parseDay(s: string): Date | null {
  const m = ISO_DAY.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Round-trip rejects Feb 30 etc.
  return d.toISOString().slice(0, 10) === s ? d : null;
}
const fmtDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

function monthStart(month: string): string {
  return `${month}-01`;
}
function monthEnd(month: string): string {
  const m = ISO_MONTH.exec(month)!;
  return fmtDay(new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)));
}

/** "YYYY-MM" shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const m = ISO_MONTH.exec(month);
  if (!m) return month;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Every "YYYY-MM" from the month of `start` to the month of `end`, inclusive. */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start.slice(0, 7);
  const last = end.slice(0, 7);
  for (let i = 0; i < 600 && cur <= last; i++) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}

function monthPeriod(first: string, last: string): Period {
  return { start: monthStart(first), end: monthEnd(last), months: monthsBetween(first, last), monthAligned: true };
}

/** Read ?range=&from=&to= (anything invalid falls back to "this_month"). */
export function parseRangeSelection(get: (key: string) => string | null | undefined): RangeSelection {
  const range = get("range");
  if (!range || !(RANGE_KEYS as readonly string[]).includes(range)) return { range: "this_month" };
  if (range !== "custom") return { range: range as RangeKey };
  const from = get("from") ?? "";
  const to = get("to") ?? "";
  if (!parseDay(from) || !parseDay(to) || from > to) return { range: "this_month" };
  return { range: "custom", from, to };
}

/** The query string for a selection ("" for the default), without a leading "?". */
export function rangeToParams(sel: RangeSelection): Record<string, string> {
  if (sel.range === "this_month") return {};
  if (sel.range === "custom" && sel.from && sel.to) return { range: "custom", from: sel.from, to: sel.to };
  return { range: sel.range };
}

/**
 * The period a selection means. `today` is "YYYY-MM-DD". `baseMonth` ("YYYY-MM") replaces the current month as the
 * anchor for "this month" (the budgets page month navigator); the other presets anchor on it as well.
 */
export function resolvePeriod(sel: RangeSelection, today: string, baseMonth?: string): Period {
  const base = baseMonth && ISO_MONTH.test(baseMonth) ? baseMonth : today.slice(0, 7);
  switch (sel.range) {
    case "last_month":
      return monthPeriod(shiftMonth(base, -1), shiftMonth(base, -1));
    case "last_3_months":
      return monthPeriod(shiftMonth(base, -2), base);
    case "last_6_months":
      return monthPeriod(shiftMonth(base, -5), base);
    case "ytd":
      return monthPeriod(`${base.slice(0, 4)}-01`, base);
    case "custom": {
      if (sel.from && sel.to && parseDay(sel.from) && parseDay(sel.to) && sel.from <= sel.to) {
        const aligned = sel.from.endsWith("-01") && sel.to === monthEnd(sel.to.slice(0, 7));
        return { start: sel.from, end: sel.to, months: monthsBetween(sel.from, sel.to), monthAligned: aligned };
      }
      return monthPeriod(base, base);
    }
    default:
      return monthPeriod(base, base);
  }
}

/** The immediately preceding period of the same length (previous month for a single month). */
export function previousPeriod(p: Period): Period {
  if (p.monthAligned) {
    const n = p.months.length;
    return monthPeriod(shiftMonth(p.months[0], -n), shiftMonth(p.months[n - 1], -n));
  }
  const s = parseDay(p.start)!;
  const e = parseDay(p.end)!;
  const len = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const prevEnd = addDays(s, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return { start: fmtDay(prevStart), end: fmtDay(prevEnd), months: monthsBetween(fmtDay(prevStart), fmtDay(prevEnd)), monthAligned: false };
}

/** Months a series fetch must cover to feed the cards: both periods plus a 6-month sparkline. */
export function seriesWindow(p: Period): { from: string; to: string } {
  const prev = previousPeriod(p);
  const to = p.months[p.months.length - 1];
  const earliest = [prev.months[0], shiftMonth(to, -5)].sort()[0];
  return { from: earliest, to };
}

export type MonthPoint = { month: string; value: number };

/**
 * One number for a period out of a monthly series. "sum" for flows (spent, budget), "last" for stocks (balance:
 * the newest month at or before the period's last month). null when the series has nothing for the period.
 */
export function aggregate(points: MonthPoint[], months: string[], mode: "sum" | "last"): number | null {
  if (months.length === 0) return null;
  if (mode === "sum") {
    const inRange = points.filter((p) => months.includes(p.month));
    return inRange.length === 0 ? null : inRange.reduce((s, p) => s + p.value, 0);
  }
  const lastMonth = months[months.length - 1];
  const upTo = points.filter((p) => p.month <= lastMonth).sort((a, b) => a.month.localeCompare(b.month));
  const hit = upTo[upTo.length - 1];
  // A stock point from before the period is stale, not the period's value.
  return hit && hit.month >= months[0] ? hit.value : null;
}

/** Percent change cur vs prev; null when either is missing or prev is 0 (never a divide-by-zero badge). */
export function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export type CardMetric = {
  value: number | null;
  prevValue: number | null;
  pct: number | null;
  /** Monthly sparkline, only with >= 2 real points. */
  sparkData?: number[];
  sparkLabels?: string[];
};

/** value + previous-period value + % + sparkline of a monthly series for a period. */
export function computeCardMetric(points: MonthPoint[], period: Period, mode: "sum" | "last", sparkMonths = 6): CardMetric {
  const prev = previousPeriod(period);
  const value = aggregate(points, period.months, mode);
  const prevValue = aggregate(points, prev.months, mode);
  const end = period.months[period.months.length - 1];
  const sorted = points.filter((p) => p.month <= end).sort((a, b) => a.month.localeCompare(b.month));
  const tail = sorted.slice(-Math.max(sparkMonths, 2));
  const hasSpark = tail.length >= 2;
  return {
    value,
    prevValue,
    pct: pctChange(value, prevValue),
    ...(hasSpark ? { sparkData: tail.map((p) => p.value), sparkLabels: tail.map((p) => p.month) } : {}),
  };
}

/** Caption after the signed difference: "vs last month" for the default period, "vs previous period" otherwise. */
export function compareCaption(sel: RangeSelection): string {
  return sel.range === "this_month" ? "vs last month" : "vs previous period";
}
