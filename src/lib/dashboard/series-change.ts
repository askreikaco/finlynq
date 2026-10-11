/**
 * Shared derivation for the Home + Accounts summary tiles: a per-month DELTA
 * series (as /api/dashboard returns it) -> running total -> sparkline points
 * and the month-over-month change vs the previous month.
 *
 * Pure; no React. Home's net-worth tile and the Accounts Net Worth / Assets /
 * Liabilities tiles all run through this so they cannot drift apart.
 */

export type SeriesPoint = { month: string; cumulative: number };

export type SeriesChange = {
  /** Running totals per month, oldest first, capped to the last `keep` months. */
  points: { month: string; value: number }[];
  /** Last `sparkMonths` running totals. */
  sparkData: number[];
  /** "YYYY-MM" labels parallel to sparkData. */
  sparkLabels: string[];
  /** Latest minus previous month; null when there are fewer than 2 months (no badge). */
  change: number | null;
  /** change as a percent of |previous|; 0 when previous is 0 or there is no change. */
  changePct: number;
};

export function deriveSeriesChange(
  rows: readonly SeriesPoint[] | null | undefined,
  opts: { keep?: number; sparkMonths?: number } = {},
): SeriesChange {
  const keep = opts.keep ?? 24;
  const sparkMonths = opts.sparkMonths ?? 12;
  const byMonth = new Map<string, number>();
  let running = 0;
  for (const p of rows ?? []) {
    running += p.cumulative;
    byMonth.set(p.month, running);
  }
  const points = Array.from(byMonth.entries())
    .map(([month, value]) => ({ month, value }))
    .slice(-keep);
  const spark = points.slice(-sparkMonths);

  let change: number | null = null;
  let changePct = 0;
  if (points.length >= 2) {
    const current = points[points.length - 1].value;
    const prev = points[points.length - 2].value;
    change = current - prev;
    changePct = prev !== 0 ? (change / Math.abs(prev)) * 100 : 0;
  }
  return {
    points,
    sparkData: spark.map((d) => d.value),
    sparkLabels: spark.map((d) => d.month),
    change,
    changePct,
  };
}
