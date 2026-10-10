import { describe, it, expect } from "vitest";
import {
  advanceOneOccurrence,
  dueOccurrences,
  isExhausted,
  rollForwardWithEnd,
  OVERDUE_RESPONSE_CAP,
} from "@/lib/subscriptions/occurrences";

describe("advanceOneOccurrence (post / skip)", () => {
  it("moves next_date one occurrence on, no end = never ends", () => {
    expect(advanceOneOccurrence({ nextDate: "2026-03-10", frequency: "monthly" })).toEqual({
      nextDate: "2026-04-10", remainingCount: null, ended: false,
    });
    expect(advanceOneOccurrence({ nextDate: "2026-03-10", frequency: "weekly" }).nextDate).toBe("2026-03-17");
  });

  it("decrements remaining_count and ends when it reaches 0 (next_date kept)", () => {
    expect(advanceOneOccurrence({ nextDate: "2026-03-10", frequency: "monthly", remainingCount: 3 })).toEqual({
      nextDate: "2026-04-10", remainingCount: 2, ended: false,
    });
    expect(advanceOneOccurrence({ nextDate: "2026-03-10", frequency: "monthly", remainingCount: 1 })).toEqual({
      nextDate: "2026-03-10", remainingCount: 0, ended: true,
    });
  });

  it("ends when the following occurrence is after end_date; end_date itself is inclusive", () => {
    expect(advanceOneOccurrence({ nextDate: "2026-03-10", frequency: "monthly", endDate: "2026-04-09" }).ended).toBe(true);
    expect(advanceOneOccurrence({ nextDate: "2026-03-10", frequency: "monthly", endDate: "2026-04-10" }).ended).toBe(false);
  });

  it("last day of month stays on month ends", () => {
    expect(advanceOneOccurrence({ nextDate: "2026-01-31", frequency: "monthly_eom" }).nextDate).toBe("2026-02-28");
  });
});

describe("isExhausted", () => {
  it("true for count <= 0 or next_date past end_date", () => {
    expect(isExhausted({ nextDate: "2026-03-10", frequency: "monthly", remainingCount: 0 })).toBe(true);
    expect(isExhausted({ nextDate: "2026-03-10", frequency: "monthly", endDate: "2026-03-09" })).toBe(true);
    expect(isExhausted({ nextDate: "2026-03-10", frequency: "monthly", endDate: "2026-03-10", remainingCount: 1 })).toBe(false);
    expect(isExhausted({ nextDate: null, frequency: "monthly" })).toBe(false);
  });
});

describe("rollForwardWithEnd (non-postable self-heal)", () => {
  const today = "2026-06-15";
  it("rolls past occurrences without an end exactly like before", () => {
    expect(rollForwardWithEnd({ nextDate: "2026-03-10", frequency: "monthly" }, today)).toEqual({
      nextDate: "2026-07-10", remainingCount: null, ended: false,
    });
  });
  it("is a no-op for a current or future date", () => {
    expect(rollForwardWithEnd({ nextDate: "2026-06-15", frequency: "monthly" }, today)).toBeNull();
    expect(rollForwardWithEnd({ nextDate: "2026-09-01", frequency: "monthly" }, today)).toBeNull();
  });
  it("consumes remaining_count for every skipped occurrence", () => {
    // Mar 10, Apr 10, May 10, Jun 10 skipped (4), Jul 10 is next.
    expect(rollForwardWithEnd({ nextDate: "2026-03-10", frequency: "monthly", remainingCount: 6 }, today)).toEqual({
      nextDate: "2026-07-10", remainingCount: 2, ended: false,
    });
  });
  it("ends when the count is used up while rolling", () => {
    const r = rollForwardWithEnd({ nextDate: "2026-03-10", frequency: "monthly", remainingCount: 4 }, today)!;
    expect(r.ended).toBe(true);
    expect(r.nextDate).toBe("2026-03-10");
    expect(r.remainingCount).toBe(0);
  });
  it("ends when the next occurrence on/after today is past end_date", () => {
    expect(rollForwardWithEnd({ nextDate: "2026-03-10", frequency: "monthly", endDate: "2026-06-30" }, today)!.ended).toBe(true);
    expect(rollForwardWithEnd({ nextDate: "2026-03-10", frequency: "monthly", endDate: "2026-07-10" }, today)).toMatchObject({ nextDate: "2026-07-10", ended: false });
  });
  it("ends a future-dated but already exhausted schedule", () => {
    expect(rollForwardWithEnd({ nextDate: "2026-09-01", frequency: "monthly", endDate: "2026-08-01" }, today)!.ended).toBe(true);
  });
  it("ignores malformed dates", () => {
    expect(rollForwardWithEnd({ nextDate: "garbage", frequency: "monthly" }, today)).toBeNull();
  });
});

describe("dueOccurrences", () => {
  it("nothing due when next_date is in the future or missing", () => {
    expect(dueOccurrences({ nextDate: "2026-07-01", frequency: "monthly" }, "2026-06-15")).toEqual({ overdue: [], dueCount: 0 });
    expect(dueOccurrences({ nextDate: null, frequency: "monthly" }, "2026-06-15")).toEqual({ overdue: [], dueCount: 0 });
  });
  it("lists next_date and every later occurrence up to today", () => {
    const r = dueOccurrences({ nextDate: "2026-03-10", frequency: "monthly" }, "2026-06-15");
    expect(r.overdue).toEqual(["2026-03-10", "2026-04-10", "2026-05-10", "2026-06-10"]);
    expect(r.dueCount).toBe(4);
  });
  it("includes an occurrence due today", () => {
    expect(dueOccurrences({ nextDate: "2026-06-15", frequency: "monthly" }, "2026-06-15").dueCount).toBe(1);
  });
  it("caps the list at 12 but counts them all", () => {
    const r = dueOccurrences({ nextDate: "2025-01-01", frequency: "weekly" }, "2026-06-15");
    expect(r.overdue).toHaveLength(OVERDUE_RESPONSE_CAP);
    expect(r.dueCount).toBeGreaterThan(60);
  });
  it("stops at end_date and remaining_count", () => {
    expect(dueOccurrences({ nextDate: "2026-03-10", frequency: "monthly", endDate: "2026-04-30" }, "2026-06-15").dueCount).toBe(2);
    expect(dueOccurrences({ nextDate: "2026-03-10", frequency: "monthly", remainingCount: 3 }, "2026-06-15").dueCount).toBe(3);
  });
});

describe("anchor-indexed advance (month-end)", () => {
  const adv = (nextDate: string, anchorDate: string | null, frequency = "monthly", extra = {}) =>
    advanceOneOccurrence({ nextDate, anchorDate, frequency, ...extra });

  it("Jan 31 monthly via post/skip: Feb 28 -> Mar 31 -> Apr 30", () => {
    let st = adv("2026-01-31", "2026-01-31");
    expect(st.nextDate).toBe("2026-02-28");
    st = adv(st.nextDate, "2026-01-31");
    expect(st.nextDate).toBe("2026-03-31");
    st = adv(st.nextDate, "2026-01-31");
    expect(st.nextDate).toBe("2026-04-30");
    st = adv(st.nextDate, "2026-01-31");
    expect(st.nextDate).toBe("2026-05-31");
  });
  it("leap years", () => {
    expect(adv("2028-01-31", "2028-01-31").nextDate).toBe("2028-02-29");
    expect(adv("2028-02-29", "2028-01-31").nextDate).toBe("2028-03-31");
    expect(adv("2027-01-31", "2027-01-31").nextDate).toBe("2027-02-28");
  });
  it("null anchor falls back to next_date (old behaviour); undefined too", () => {
    expect(adv("2026-02-28", null).nextDate).toBe("2026-03-28");
    expect(advanceOneOccurrence({ nextDate: "2026-02-28", frequency: "monthly" }).nextDate).toBe("2026-03-28");
  });
  it("biweekly / weekly are unaffected by the anchor", () => {
    expect(adv("2026-02-14", "2026-01-31", "biweekly").nextDate).toBe("2026-02-28");
    expect(adv("2026-02-14", null, "biweekly").nextDate).toBe("2026-02-28");
    expect(adv("2026-02-14", "2026-01-31", "weekly").nextDate).toBe("2026-02-21");
  });
  it("end conditions still apply (remaining_count 1 ends, end_date inclusive)", () => {
    expect(adv("2026-02-28", "2026-01-31", "monthly", { remainingCount: 1 })).toMatchObject({ ended: true, nextDate: "2026-02-28" });
    expect(adv("2026-02-28", "2026-01-31", "monthly", { endDate: "2026-03-31" })).toMatchObject({ ended: false, nextDate: "2026-03-31" });
    expect(adv("2026-02-28", "2026-01-31", "monthly", { endDate: "2026-03-30" }).ended).toBe(true);
  });
  it("daily / weekdays / weekend advance", () => {
    expect(adv("2026-10-09", null, "daily").nextDate).toBe("2026-10-10");
    expect(adv("2026-10-09", null, "weekdays").nextDate).toBe("2026-10-12");
    expect(adv("2026-10-10", null, "weekend").nextDate).toBe("2026-10-11");
    expect(adv("2026-10-11", "2026-10-10", "weekend").nextDate).toBe("2026-10-17");
    expect(adv("2026-10-09", "2026-10-09", "weekdays", { remainingCount: 1 }).ended).toBe(true);
  });

  it("stale-advance (rollForwardWithEnd) rolls Feb 28 to Mar 31, not Mar 28", () => {
    expect(rollForwardWithEnd({ nextDate: "2026-02-28", anchorDate: "2026-01-31", frequency: "monthly" }, "2026-03-10")).toEqual({
      nextDate: "2026-03-31", remainingCount: null, ended: false,
    });
    expect(rollForwardWithEnd({ nextDate: "2026-02-28", anchorDate: null, frequency: "monthly" }, "2026-03-10")?.nextDate).toBe("2026-03-28");
    // Skipped Feb 28, Mar 31, Apr 30, May 31 -> Jun 30 is next; 4 consumed from the count.
    expect(rollForwardWithEnd({ nextDate: "2026-02-28", anchorDate: "2026-01-31", frequency: "monthly", remainingCount: 9 }, "2026-06-15")).toEqual({
      nextDate: "2026-06-30", remainingCount: 5, ended: false,
    });
  });
  it("stale-advance for weekdays / weekend counts matching days", () => {
    // Fri Oct 9 .. today Wed Oct 14: skipped Oct 9, 12, 13 -> next is Oct 14 itself (on/after today).
    expect(rollForwardWithEnd({ nextDate: "2026-10-09", frequency: "weekdays", remainingCount: 10 }, "2026-10-14")).toEqual({
      nextDate: "2026-10-14", remainingCount: 7, ended: false,
    });
    expect(rollForwardWithEnd({ nextDate: "2026-10-10", frequency: "weekend" }, "2026-10-12")?.nextDate).toBe("2026-10-17");
    expect(rollForwardWithEnd({ nextDate: "2026-10-09", frequency: "daily" }, "2026-10-12")?.nextDate).toBe("2026-10-12");
  });
  it("a stale anchor (next_date edited off the series) rolls from next_date", () => {
    expect(rollForwardWithEnd({ nextDate: "2026-03-05", anchorDate: "2026-01-31", frequency: "monthly" }, "2026-04-10")?.nextDate).toBe("2026-05-05");
  });

  it("dueOccurrences lists from the anchor", () => {
    const r = dueOccurrences({ nextDate: "2026-02-28", anchorDate: "2026-01-31", frequency: "monthly" }, "2026-05-31");
    expect(r.overdue).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(dueOccurrences({ nextDate: "2026-02-28", anchorDate: null, frequency: "monthly" }, "2026-05-31").overdue).toEqual([
      "2026-02-28", "2026-03-28", "2026-04-28", "2026-05-28",
    ]);
  });
  it("dueOccurrences for weekdays / weekend", () => {
    expect(dueOccurrences({ nextDate: "2026-10-09", frequency: "weekdays" }, "2026-10-13").overdue).toEqual(["2026-10-09", "2026-10-12", "2026-10-13"]);
    expect(dueOccurrences({ nextDate: "2026-10-10", frequency: "weekend" }, "2026-10-18").overdue).toEqual(["2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18"]);
    expect(dueOccurrences({ nextDate: "2026-10-09", frequency: "weekdays", remainingCount: 2 }, "2026-10-30").dueCount).toBe(2);
  });
});
