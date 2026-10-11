/**
 * Monthly view of one account's balance history for the account-detail Balance card.
 * Input: dated balances as /api/net-worth-history returns them (value = balance on that date, not a delta).
 * Output: one point per calendar month (that month's last known balance, oldest first), plus the change of
 * the latest balance against the previous month's. Pure; no React.
 */

export type BalancePoint = { date: string; value: number };

export type BalanceMonthly = {
  /** Month-end balances, oldest first, capped to the last `sparkMonths`. */
  sparkData: number[];
  /** "YYYY-MM" labels parallel to sparkData. */
  sparkLabels: string[];
  /** Latest balance vs the previous month's, as a percent of |previous|; null when there is no previous month or it was 0. */
  changePct: number | null;
};

export function deriveBalanceMonthly(
  points: readonly BalancePoint[] | null | undefined,
  opts: { sparkMonths?: number } = {},
): BalanceMonthly {
  const sparkMonths = opts.sparkMonths ?? 12;
  const byMonth = new Map<string, number>();
  const sorted = [...(points ?? [])]
    .filter((p) => typeof p.date === "string" && p.date.length >= 7 && Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const p of sorted) byMonth.set(p.date.slice(0, 7), p.value);
  const months = Array.from(byMonth.entries()).slice(-sparkMonths);
  const sparkData = months.map(([, v]) => v);
  const sparkLabels = months.map(([m]) => m);

  let changePct: number | null = null;
  if (sparkData.length >= 2) {
    const current = sparkData[sparkData.length - 1];
    const prev = sparkData[sparkData.length - 2];
    if (prev !== 0) changePct = ((current - prev) / Math.abs(prev)) * 100;
  }
  return { sparkData, sparkLabels, changePct };
}
