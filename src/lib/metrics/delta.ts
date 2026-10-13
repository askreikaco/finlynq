import { formatCurrency } from "@/lib/currency";
import { computeCardMetric, type CardMetric, type MonthPoint, type Period } from "./period";

/** Muted sub-line for a card whose previous period is not derivable (no history): never a made-up number. */
export const NO_HISTORY_CAPTION = "No earlier history to compare";

export type DeltaKind = "money" | "points" | "pp" | "count";

const signed = (n: number) => (n >= 0 ? "+" : "-");

/**
 * The shared "signed value difference vs the previous period" sub-line used by every metric card, like the Net Worth
 * card's "+$1,234 vs last month":
 *   money  -> "+$1,234 vs last month"      (formatCurrency in `currency`)
 *   points -> "+3 pts vs last month"       (a score)
 *   pp     -> "-1.5 pp vs last month"      (a rate, percentage points)
 *   count  -> "+1 vs last month"
 * null when either side is missing (previous period not derivable: no delta line at all).
 */
export function formatDelta(opts: {
  cur: number | null | undefined;
  prev: number | null | undefined;
  kind: DeltaKind;
  currency?: string;
  caption: string;
}): string | null {
  const { cur, prev, kind, currency, caption } = opts;
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  const diff = cur - prev;
  let body: string;
  if (kind === "money") {
    body = `${signed(diff)}${formatCurrency(Math.abs(diff), currency ?? "USD")}`;
  } else if (kind === "points") {
    body = `${signed(diff)}${Math.abs(Math.round(diff * 10) / 10)} pts`;
  } else if (kind === "pp") {
    body = `${signed(diff)}${Math.abs(Math.round(diff * 10) / 10)} pp`;
  } else {
    body = `${signed(diff)}${Math.abs(Math.round(diff))}`;
  }
  return `${body} ${caption}`;
}

export type ResolvedCard = {
  /** The big number: the page's own figure for the default period, the series aggregate for any other range. */
  value: number | null;
  badgePct: number | null;
  /** Signed difference line, null when the previous period is not derivable. */
  delta: string | null;
  sparkData?: number[];
  sparkLabels?: string[];
};

/**
 * One card from a monthly series. `pageValue` (the number the page already computed, e.g. a ledger balance) is used
 * as the big value only for the default period; the badge and delta always come from the series so both sides of
 * the comparison are the same basis.
 */
export function resolveCard(opts: {
  points: MonthPoint[] | null | undefined;
  period: Period;
  mode: "sum" | "last";
  isDefault: boolean;
  pageValue?: number | null;
  kind: DeltaKind;
  currency?: string;
  caption: string;
}): ResolvedCard {
  const { points, period, mode, isDefault, pageValue, kind, currency, caption } = opts;
  const m: CardMetric = points && points.length > 0
    ? computeCardMetric(points, period, mode)
    : { value: null, prevValue: null, pct: null };
  const value = isDefault && pageValue != null ? pageValue : m.value;
  return {
    value,
    badgePct: m.pct,
    delta: formatDelta({ cur: m.value, prev: m.prevValue, kind, currency, caption }),
    ...(m.sparkData ? { sparkData: m.sparkData, sparkLabels: m.sparkLabels } : {}),
  };
}
