/**
 * Month-by-month history of the subscription cards (Monthly cost, Yearly cost, Due in the next 30 days, Active).
 * Pure; used by GET /api/subscriptions/series and its tests.
 *
 * A subscription keeps no start / pause / cancel dates, so "was it running in month M" comes from what IS recorded:
 *   - the transactions booked against it (subscription_id): first = start, last = when a paused / cancelled /
 *     ended one stopped;
 *   - its end_date;
 *   - its status now (the current month always uses it, so the newest point equals the page's own figure).
 * An active subscription with no booking has no known start and counts in every month (a steady cost, never a
 * made-up jump); a paused / cancelled / ended one with nothing recorded counts in none. Money is the page's own
 * figure: the display-currency amount at TODAY's rate, so the history shows count / cadence changes, not FX noise.
 */
import { monthsBetween } from "@/lib/metrics/period";
import { addDays, effectiveAnchor, monthlyEquivalent, occurrencesBetween, scheduleFrequency } from "./schedule";

export const DUE_SOON_DAYS = 30;

export interface HistorySub {
  id: number;
  status: string;
  /** Display-currency amount of one payment (positive). */
  displayAmount: number;
  frequency: string;
  intervalDays?: number | null;
  nextDate?: string | null;
  anchorDate?: string | null;
  endDate?: string | null;
}

export interface SubscriptionMonthPoint {
  month: string;
  monthly: number;
  annual: number;
  active: number;
  dueSoon: number;
  dueSoonCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (d: string) => d.slice(0, 7);
function monthEndOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Was the subscription running in `month`? `todayMonth` = the current month (status now decides). */
export function runningIn(s: HistorySub, month: string, todayMonth: string, firstTx?: string, lastTx?: string): boolean {
  if (month >= todayMonth) return s.status === "active";
  const start = firstTx ? monthOf(firstTx) : null;
  if (start && month < start) return false;
  if (s.status === "active") return !(s.endDate && month > monthOf(s.endDate));
  const stop = s.status === "ended" && s.endDate ? monthOf(s.endDate) : lastTx ? monthOf(lastTx) : null;
  return stop != null && month <= stop;
}

export function buildSubscriptionSeries(opts: {
  subs: readonly HistorySub[];
  firstTx: ReadonlyMap<number, string>;
  lastTx: ReadonlyMap<number, string>;
  from: string;
  to: string;
  today: string;
}): SubscriptionMonthPoint[] {
  const { subs, firstTx, lastTx, from, to, today } = opts;
  const todayMonth = monthOf(today);
  return monthsBetween(from, to).map((month) => {
    // Due-soon looks 30 days ahead of month end (of today for the running month), like the page card.
    const ref = month >= todayMonth ? today : monthEndOf(month);
    let monthly = 0, active = 0, dueSoon = 0, dueSoonCount = 0;
    for (const s of subs) {
      if (!runningIn(s, month, todayMonth, firstTx.get(s.id), lastTx.get(s.id))) continue;
      const amount = Math.abs(s.displayAmount);
      monthly += monthlyEquivalent(amount, s.frequency, s.intervalDays);
      active += 1;
      if (!s.nextDate) continue;
      const key = scheduleFrequency(s.frequency, s.intervalDays);
      const n = occurrencesBetween(effectiveAnchor(s.anchorDate, s.nextDate, key), key, ref, addDays(ref, DUE_SOON_DAYS)).length;
      dueSoon += n * amount;
      dueSoonCount += n;
    }
    return { month, monthly: round2(monthly), annual: round2(monthly * 12), active, dueSoon: round2(dueSoon), dueSoonCount };
  });
}
