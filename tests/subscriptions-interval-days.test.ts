/**
 * Custom "every N days" cadence (frequency `every_n_days` + subscriptions.interval_days):
 * schedule math, labels/equivalents, anchor-indexed advance, post/skip, due scan,
 * stale roll-forward, and the migration <-> schema parity.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import {
  annualEquivalent,
  effectiveAnchor,
  firstOccurrenceAfter,
  frequencyLabel,
  frequencySuffix,
  intervalDaysOf,
  monthlyEquivalent,
  nextOnOrAfter,
  normalizeFrequency,
  occurrenceAt,
  occurrenceFromNext,
  occurrencesBetween,
  rollForwardNextDate,
  scheduleFrequency,
  stepsToOnOrAfter,
} from "@/lib/subscriptions/schedule";
import { advanceOneOccurrence, dueOccurrences, rollForwardWithEnd } from "@/lib/subscriptions/occurrences";
import { advanceStaleSubscriptionDates } from "@/lib/subscriptions/advance-next-dates";
import { buildScheduleEvents, subscriptionTotals, type SubscriptionRow } from "@/lib/subscriptions/calendar-events";

const k = (n: number) => scheduleFrequency("every_n_days", n);

describe("scheduleFrequency / normalize", () => {
  it("builds the engine key and leaves other cadences alone", () => {
    expect(k(3)).toBe("every_n_days:3");
    expect(scheduleFrequency("monthly", 3)).toBe("monthly");
    expect(scheduleFrequency("yearly", 3)).toBe("annual");
    expect(scheduleFrequency("every_n_days:7")).toBe("every_n_days:7");
    expect(scheduleFrequency("every_n_days:7", 4)).toBe("every_n_days:4");
  });
  it("normalizes the composite key and degrades a bad interval to a 1-day step", () => {
    expect(normalizeFrequency("every_n_days:3")).toBe("every_n_days");
    expect(normalizeFrequency("EVERY_N_DAYS")).toBe("every_n_days");
    for (const bad of [0, 366, 2.5, null, undefined]) {
      expect(intervalDaysOf("every_n_days", bad as never)).toBe(1);
    }
    expect(occurrenceAt("2026-01-01", "every_n_days", 3)).toBe("2026-01-04");
    expect(intervalDaysOf("monthly")).toBeNull();
    expect(intervalDaysOf("every_n_days", 365)).toBe(365);
  });
});

describe("occurrenceAt / nextOnOrAfter (step = N days from the anchor)", () => {
  it.each([2, 3, 10])("N=%i steps N days per index, back and forth", (n) => {
    const f = k(n);
    expect(occurrenceAt("2026-03-01", f, 0)).toBe("2026-03-01");
    expect(occurrenceAt("2026-03-01", f, 1)).toBe(`2026-03-${String(1 + n).padStart(2, "0")}`);
    expect(occurrenceAt("2026-03-01", f, 2)).toBe(`2026-03-${String(1 + 2 * n).padStart(2, "0")}`);
    expect(occurrenceAt("2026-03-15", f, -1)).toBe(`2026-03-${String(15 - n).padStart(2, "0")}`);
  });
  it("crosses month ends (N=3 from Jan 30: Feb 2, Feb 5 ...)", () => {
    expect([0, 1, 2, 3].map((i) => occurrenceAt("2026-01-30", k(3), i))).toEqual(["2026-01-30", "2026-02-02", "2026-02-05", "2026-02-08"]);
  });
  it("crosses a non-leap February (N=10 from Feb 20 2026: Mar 2) and a leap one (2028: Mar 1)", () => {
    expect(occurrenceAt("2026-02-20", k(10), 1)).toBe("2026-03-02");
    expect(occurrenceAt("2028-02-20", k(10), 1)).toBe("2028-03-01");
  });
  it("lands on and steps over a leap day (N=2)", () => {
    expect([0, 1, 2].map((i) => occurrenceAt("2028-02-27", k(2), i))).toEqual(["2028-02-27", "2028-02-29", "2028-03-02"]);
    expect([0, 1].map((i) => occurrenceAt("2028-02-28", k(2), i))).toEqual(["2028-02-28", "2028-03-01"]);
  });
  it("crosses year ends (N=10 from Dec 25: Jan 4)", () => {
    expect(occurrenceAt("2026-12-25", k(10), 1)).toBe("2027-01-04");
    expect(occurrenceAt("2026-12-31", k(2), 1)).toBe("2027-01-02");
  });
  it("N=1 is exactly daily", () => {
    for (let i = -3; i < 40; i++) expect(occurrenceAt("2026-12-20", k(1), i)).toBe(occurrenceAt("2026-12-20", "daily", i));
  });
  it("nextOnOrAfter rounds up to the next step", () => {
    expect(nextOnOrAfter("2026-03-01", k(3), "2026-03-01")).toBe("2026-03-01");
    expect(nextOnOrAfter("2026-03-01", k(3), "2026-03-02")).toBe("2026-03-04");
    expect(nextOnOrAfter("2026-03-01", k(3), "2026-03-04")).toBe("2026-03-04");
    expect(nextOnOrAfter("2026-03-01", k(10), "2026-03-12")).toBe("2026-03-21");
    // before the anchor too
    expect(nextOnOrAfter("2026-03-10", k(3), "2026-03-02")).toBe("2026-03-04");
  });
  it("firstOccurrenceAfter (the next date of a just-booked repeat)", () => {
    expect(firstOccurrenceAfter("2026-12-31", k(2))).toBe("2027-01-02");
    expect(firstOccurrenceAfter("2028-02-28", k(3))).toBe("2028-03-02");
    expect(firstOccurrenceAfter("2026-10-10", k(10))).toBe("2026-10-20");
  });
  it("occurrencesBetween lists every Nth day in range", () => {
    expect(occurrencesBetween("2026-01-01", k(10), "2026-01-15", "2026-02-15")).toEqual(["2026-01-21", "2026-01-31", "2026-02-10"]);
    expect(occurrencesBetween("2028-02-27", k(2), "2028-02-26", "2028-03-03")).toEqual(["2028-02-27", "2028-02-29", "2028-03-02"]);
  });
});

describe("anchor-indexed advance (occurrenceFromNext / stepsToOnOrAfter)", () => {
  it("advances k steps from next_date on the series", () => {
    expect(occurrenceFromNext("2026-03-01", "2026-03-07", k(3), 1)).toBe("2026-03-10");
    expect(occurrenceFromNext("2026-03-01", "2026-03-07", k(3), 4)).toBe("2026-03-19");
    expect(occurrenceFromNext("2026-03-01", "2026-03-07", k(3), 0)).toBe("2026-03-07");
  });
  it("a next_date edited off the series becomes the new anchor", () => {
    expect(effectiveAnchor("2026-03-01", "2026-03-08", k(3))).toBe("2026-03-08");
    expect(occurrenceFromNext("2026-03-01", "2026-03-08", k(3), 1)).toBe("2026-03-11");
    expect(effectiveAnchor("2026-03-01", "2026-03-07", k(3))).toBe("2026-03-01");
    expect(effectiveAnchor(null, "2026-03-07", k(3))).toBe("2026-03-07");
  });
  it("stepsToOnOrAfter counts occurrences up to the first on/after a date", () => {
    expect(stepsToOnOrAfter("2026-03-01", "2026-03-04", k(3), "2026-03-04")).toBe(0);
    expect(stepsToOnOrAfter("2026-03-01", "2026-03-04", k(3), "2026-03-05")).toBe(1);
    expect(stepsToOnOrAfter("2026-03-01", "2026-03-04", k(3), "2026-03-22")).toBe(6);
    expect(occurrenceFromNext("2026-03-01", "2026-03-04", k(3), 6)).toBe("2026-03-22");
  });
  it("rollForwardNextDate keeps the N-day rhythm across a year end", () => {
    expect(rollForwardNextDate("2026-12-20", k(10), "2027-01-05", "2026-12-20")).toBe("2027-01-09");
    expect(rollForwardNextDate("2026-12-20", k(10), "2026-12-20", "2026-12-20")).toBe("2026-12-20");
    expect(rollForwardNextDate("2028-02-20", k(10), "2028-03-01", "2028-02-20")).toBe("2028-03-01");
  });
});

describe("labels and per-year equivalents", () => {
  it("labels 'Every N days' (1 = Every day) and suffixes", () => {
    expect(frequencyLabel("every_n_days", 3)).toBe("Every 3 days");
    expect(frequencyLabel(k(10))).toBe("Every 10 days");
    expect(frequencyLabel("every_n_days", 1)).toBe("Every day");
    expect(frequencyLabel("monthly", 3)).toBe("Monthly");
    expect(frequencySuffix("every_n_days", 3)).toBe("3 days");
    expect(frequencySuffix("every_n_days", 1)).toBe("day");
    expect(frequencySuffix("monthly")).toBe("mo");
  });
  it("uses 365 / N periods per year", () => {
    expect(annualEquivalent(10, "every_n_days", 5)).toBeCloseTo(730);
    expect(annualEquivalent(10, k(5))).toBeCloseTo(730);
    expect(monthlyEquivalent(10, "every_n_days", 10)).toBeCloseTo((10 * 36.5) / 12);
    expect(annualEquivalent(10, "every_n_days", 1)).toBe(annualEquivalent(10, "daily"));
    expect(annualEquivalent(10, "monthly", 5)).toBe(120);
  });
});

describe("advance / post / skip / due / self-heal with an interval", () => {
  const state = { nextDate: "2026-03-04", anchorDate: "2026-03-01", frequency: "every_n_days", intervalDays: 3 };
  it("advanceOneOccurrence (post or skip) moves one step and consumes the count", () => {
    expect(advanceOneOccurrence({ ...state, remainingCount: 3 })).toEqual({ nextDate: "2026-03-07", remainingCount: 2, ended: false });
    expect(advanceOneOccurrence({ ...state, remainingCount: 1 })).toMatchObject({ remainingCount: 0, ended: true });
    expect(advanceOneOccurrence({ ...state, endDate: "2026-03-06" })).toMatchObject({ ended: true });
    expect(advanceOneOccurrence({ ...state, nextDate: "2026-12-31", anchorDate: "2026-12-31", intervalDays: 2 })).toMatchObject({ nextDate: "2027-01-02" });
  });
  it("dueOccurrences lists each overdue step up to today", () => {
    const due = dueOccurrences(state, "2026-03-11");
    expect(due.overdue).toEqual(["2026-03-04", "2026-03-07", "2026-03-10"]);
    expect(due.dueCount).toBe(3);
    expect(dueOccurrences({ ...state, remainingCount: 2 }, "2026-03-11").dueCount).toBe(2);
  });
  it("rollForwardWithEnd skips whole steps and consumes the count", () => {
    expect(rollForwardWithEnd({ ...state, remainingCount: 10 }, "2026-03-11")).toEqual({ nextDate: "2026-03-13", remainingCount: 7, ended: false });
  });
  it("without an interval column value, the row degrades to daily (never crashes)", () => {
    expect(advanceOneOccurrence({ ...state, intervalDays: null, anchorDate: "2026-03-04" }).nextDate).toBe("2026-03-05");
  });
  it("existing rows (null interval, other cadences) are unaffected", () => {
    expect(advanceOneOccurrence({ nextDate: "2026-02-28", anchorDate: "2026-01-31", frequency: "monthly", intervalDays: null }).nextDate).toBe("2026-03-31");
    expect(advanceOneOccurrence({ nextDate: "2026-03-04", frequency: "weekly" }).nextDate).toBe("2026-03-11");
  });

  it("advanceStaleSubscriptionDates reads interval_days and rolls by the step", async () => {
    const updates: string[] = [];
    const execute = vi.fn(async (q: unknown) => {
      const text = JSON.stringify(q);
      if (text.includes("UPDATE")) {
        updates.push(text);
        return [];
      }
      return [{ id: 1, next_date: "2026-03-04", frequency: "every_n_days", interval_days: 3, end_date: null, remaining_count: null, anchor_date: "2026-03-01", postable: false }];
    });
    expect(await advanceStaleSubscriptionDates({ execute } as never, "u1", "2026-03-11")).toBe(1);
    expect(JSON.stringify(execute.mock.calls[0][0])).toContain("interval_days");
    expect(updates[0]).toContain("2026-03-13");
  });
});

describe("calendar builders", () => {
  const sub: SubscriptionRow = {
    id: 5, name: "Gym", amount: 10, currency: "USD", frequency: "every_n_days", intervalDays: 10,
    nextDate: "2026-12-25", anchorDate: "2026-12-25", status: "active",
  };
  it("projects events across the year end and carries the interval", () => {
    const ev = buildScheduleEvents([sub], [], "2026-12-20", "2027-01-31");
    expect(ev.map((e) => e.date)).toEqual(["2026-12-25", "2027-01-04", "2027-01-14", "2027-01-24"]);
    expect(ev[0]).toMatchObject({ frequency: "every_n_days", intervalDays: 10, subscriptionId: 5 });
  });
  it("totals use 365/N periods and the due-soon window counts the steps", () => {
    const t = subscriptionTotals([sub], "2026-12-25", "2027-01-15");
    expect(t.monthly).toBeCloseTo((10 * 36.5) / 12);
    expect(t.dueSoonCount).toBe(3);
    expect(t.dueSoonAmount).toBe(30);
  });
});

describe("20261016_subscription_interval_days migration", () => {
  const ROOT = path.resolve(__dirname, "..");
  const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
  const MIG = "scripts/migrations/20261016_subscription_interval_days.sql";
  const DOWN = "scripts/migrations/down/20261016_subscription_interval_days.down.sql";
  it("adds a nullable integer column, idempotently, with a down file and schema parity", () => {
    const sql = read(MIG);
    expect(existsSync(path.join(ROOT, DOWN))).toBe(true);
    expect(sql).toContain("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS interval_days integer;");
    expect(sql).not.toMatch(/interval_days integer\s+NOT NULL/i);
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\b/im);
    expect(read(DOWN)).toContain("ALTER TABLE subscriptions DROP COLUMN IF EXISTS interval_days;");
    expect(read("src/db/schema-pg.ts")).toContain('intervalDays: integer("interval_days")');
  });
});
