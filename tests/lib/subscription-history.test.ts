import { describe, it, expect } from "vitest";
import { buildSubscriptionSeries, runningIn, type HistorySub } from "@/lib/subscriptions/history";
import { frequencyGroupKey, FREQUENCY_GROUPS } from "@/lib/subscriptions/schedule";

const base = { frequency: "monthly", nextDate: "2026-10-20", displayAmount: 10 };
const S = (o: Partial<HistorySub> & { id: number }): HistorySub => ({ status: "active", ...base, ...o });
const TODAY = "2026-10-14";

describe("subscription history", () => {
  it("an active sub with bookings starts at its first booking; without any it counts in every month", () => {
    const subs = [S({ id: 1 }), S({ id: 2 })];
    const rows = buildSubscriptionSeries({ subs, firstTx: new Map([[1, "2026-08-05"]]), lastTx: new Map(), from: "2026-06", to: "2026-10", today: TODAY });
    expect(rows.map((r) => r.active)).toEqual([1, 1, 2, 2, 2]);
    expect(rows.map((r) => r.monthly)).toEqual([10, 10, 20, 20, 20]);
    expect(rows[4].annual).toBe(240);
  });

  it("paused / cancelled run between first and last booking, never in the current month; unrecorded ones never", () => {
    const paused = S({ id: 1, status: "paused" });
    const none = S({ id: 2, status: "cancelled" });
    const f = new Map([[1, "2026-05-01"]]);
    const l = new Map([[1, "2026-07-20"]]);
    expect(["2026-04", "2026-05", "2026-07", "2026-08", "2026-10"].map((m) => runningIn(paused, m, "2026-10", f.get(1), l.get(1)))).toEqual([false, true, true, false, false]);
    expect(runningIn(none, "2026-08", "2026-10")).toBe(false);
  });

  it("an ended sub stops at its end date; the current month equals the page's active set", () => {
    const ended = S({ id: 1, status: "ended", endDate: "2026-08-15" });
    expect(runningIn(ended, "2026-08", "2026-10", "2026-04-01", "2026-08-15")).toBe(true);
    expect(runningIn(ended, "2026-09", "2026-10", "2026-04-01", "2026-08-15")).toBe(false);
  });

  it("yearly cadence is priced per month and due-soon counts occurrences in the next 30 days", () => {
    const yearly = S({ id: 1, frequency: "annual", displayAmount: 120, nextDate: "2026-10-20" });
    const [row] = buildSubscriptionSeries({ subs: [yearly], firstTx: new Map(), lastTx: new Map(), from: "2026-10", to: "2026-10", today: TODAY });
    expect(row.monthly).toBe(10);
    expect(row.dueSoon).toBe(120);
    expect(row.dueSoonCount).toBe(1);
  });

  it("frequency groups cover every cadence in a fixed order", () => {
    expect(FREQUENCY_GROUPS.map((g) => g.key)).toEqual(["daily", "weekly", "monthly", "quarterly", "yearly", "custom"]);
    expect(["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual", "every_n_days", "bogus"].map(frequencyGroupKey))
      .toEqual(["weekly", "weekly", "monthly", "monthly", "quarterly", "yearly", "yearly", "custom", "monthly"]);
  });
});
