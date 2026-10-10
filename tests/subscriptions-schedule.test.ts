import { describe, it, expect } from "vitest";
import {
  addDays,
  annualEquivalent,
  daysBetween,
  frequencyLabel,
  frequencyOrMonthly,
  monthlyEquivalent,
  nextOnOrAfter,
  normalizeFrequency,
  occurrenceAt,
  occurrencesBetween,
  rollForwardNextDate,
  SUBSCRIPTION_FREQUENCIES,
  firstOccurrenceAfter,
  isWithinEnd,
  effectiveAnchor,
  occurrenceFromNext,
  stepsToOnOrAfter,
  FREQUENCY_LABELS,
  FREQUENCY_SUFFIX,
} from "@/lib/subscriptions/schedule";

describe("subscription schedule — frequencies", () => {
  it("offers daily through annual, including every-2-weeks and semi-annual", () => {
    expect(SUBSCRIPTION_FREQUENCIES).toEqual([
      "daily", "weekdays", "weekend", "weekly", "biweekly", "every4weeks", "monthly", "monthly_eom", "bimonthly", "quarterly", "semiannual", "annual",
    ]);
  });

  it("normalizes legacy and alternate spellings", () => {
    expect(normalizeFrequency("yearly")).toBe("annual");
    expect(normalizeFrequency(" Annually ")).toBe("annual");
    expect(normalizeFrequency("semi-annual")).toBe("semiannual");
    expect(normalizeFrequency("half-yearly")).toBe("semiannual");
    expect(normalizeFrequency("fortnightly")).toBe("biweekly");
    expect(normalizeFrequency("bi-weekly")).toBe("biweekly");
    expect(normalizeFrequency("hourly")).toBeNull();
    expect(normalizeFrequency(null)).toBeNull();
    expect(frequencyOrMonthly("whatever")).toBe("monthly");
    expect(frequencyLabel("semiannual")).toBe("Semi-annual");
  });

  it("prices every cadence as a monthly / annual equivalent", () => {
    expect(monthlyEquivalent(120, "annual")).toBe(10);
    expect(monthlyEquivalent(120, "yearly")).toBe(10); // MCP-written spelling
    expect(monthlyEquivalent(60, "semiannual")).toBe(10);
    expect(monthlyEquivalent(30, "quarterly")).toBe(10);
    expect(monthlyEquivalent(10, "monthly")).toBe(10);
    expect(monthlyEquivalent(12, "weekly")).toBeCloseTo(52, 10);
    expect(monthlyEquivalent(12, "biweekly")).toBeCloseTo(26, 10);
    expect(annualEquivalent(10, "monthly")).toBe(120);
    expect(annualEquivalent(50, "semiannual")).toBe(100);
  });
});

describe("subscription schedule — dates", () => {
  it("clamps month-end anchors and re-expands (no Jan 31 → Mar 3 overflow, no drift)", () => {
    expect(occurrenceAt("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceAt("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceAt("2024-01-31", "monthly", 1)).toBe("2024-02-29");
    expect(occurrenceAt("2026-08-31", "semiannual", 1)).toBe("2027-02-28");
    expect(occurrenceAt("2024-02-29", "annual", 1)).toBe("2025-02-28");
    expect(occurrenceAt("2024-02-29", "annual", 4)).toBe("2028-02-29");
  });

  it("projects backwards as well as forwards", () => {
    expect(occurrenceAt("2026-03-15", "monthly", -2)).toBe("2026-01-15");
    expect(occurrenceAt("2026-03-15", "quarterly", -1)).toBe("2025-12-15");
    expect(occurrenceAt("2026-03-15", "weekly", -1)).toBe("2026-03-08");
    expect(occurrenceAt("2026-03-15", "biweekly", 2)).toBe("2026-04-12");
  });

  it("finds the first occurrence on/after a date", () => {
    expect(nextOnOrAfter("2026-01-15", "monthly", "2026-10-01")).toBe("2026-10-15");
    expect(nextOnOrAfter("2026-01-15", "monthly", "2026-10-15")).toBe("2026-10-15");
    expect(nextOnOrAfter("2026-01-15", "monthly", "2026-10-16")).toBe("2026-11-15");
    expect(nextOnOrAfter("2025-03-01", "semiannual", "2026-10-01")).toBe("2027-03-01");
    expect(nextOnOrAfter("2026-09-28", "weekly", "2026-10-01")).toBe("2026-10-05");
    // A future anchor projects backwards too.
    expect(nextOnOrAfter("2026-12-01", "monthly", "2026-10-01")).toBe("2026-10-01");
  });

  it("rolls a passed next-payment date forward and leaves current ones alone", () => {
    expect(rollForwardNextDate("2026-02-10", "monthly", "2026-10-01")).toBe("2026-10-10");
    expect(rollForwardNextDate("2025-06-30", "annual", "2026-10-01")).toBe("2027-06-30");
    expect(rollForwardNextDate("2026-10-20", "monthly", "2026-10-01")).toBe("2026-10-20");
    expect(rollForwardNextDate("2026-10-01", "monthly", "2026-10-01")).toBe("2026-10-01");
    expect(rollForwardNextDate(null, "monthly", "2026-10-01")).toBeNull();
    expect(rollForwardNextDate("not-a-date", "monthly", "2026-10-01")).toBeNull();
  });

  it("lists every occurrence inside a range, inclusive", () => {
    expect(occurrencesBetween("2026-01-05", "weekly", "2026-10-01", "2026-10-31")).toEqual([
      "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26",
    ]);
    expect(occurrencesBetween("2026-01-31", "monthly", "2026-02-01", "2026-04-30")).toEqual([
      "2026-02-28", "2026-03-31", "2026-04-30",
    ]);
    expect(occurrencesBetween("2026-03-01", "annual", "2026-10-01", "2026-10-31")).toEqual([]);
    expect(occurrencesBetween("2026-03-01", "monthly", "2026-10-31", "2026-10-01")).toEqual([]);
  });

  it("does date arithmetic in UTC", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST change day
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // EU DST change day
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
  });
});

describe("subscription schedule — repeat frequencies (every4weeks / bimonthly / monthly_eom)", () => {
  it("normalizes and labels the new cadences", () => {
    expect(normalizeFrequency("every4weeks")).toBe("every4weeks");
    expect(normalizeFrequency("Every 4 weeks")).toBe("every4weeks");
    expect(normalizeFrequency("bi-monthly")).toBe("bimonthly");
    expect(normalizeFrequency("monthly_eom")).toBe("monthly_eom");
    expect(normalizeFrequency("last day of month")).toBe("monthly_eom");
    expect(frequencyLabel("every4weeks")).toBe("Every 4 weeks");
    expect(frequencyLabel("bimonthly")).toBe("Every 2 months");
    expect(frequencyLabel("monthly_eom")).toBe("Last day of month");
  });

  it("prices them per month / year", () => {
    expect(annualEquivalent(10, "every4weeks")).toBe(130);
    expect(monthlyEquivalent(12, "bimonthly")).toBe(6);
    expect(annualEquivalent(10, "bimonthly")).toBe(60);
    expect(monthlyEquivalent(10, "monthly_eom")).toBe(10);
  });

  it("every4weeks steps 28 days", () => {
    expect(occurrenceAt("2026-01-05", "every4weeks", 1)).toBe("2026-02-02");
    expect(occurrenceAt("2026-01-05", "every4weeks", 13)).toBe("2027-01-04");
    expect(occurrenceAt("2026-02-02", "every4weeks", -1)).toBe("2026-01-05");
    expect(nextOnOrAfter("2026-01-05", "every4weeks", "2026-02-03")).toBe("2026-03-02");
    expect(occurrencesBetween("2026-01-05", "every4weeks", "2026-01-01", "2026-03-31")).toEqual([
      "2026-01-05", "2026-02-02", "2026-03-02", "2026-03-30",
    ]);
  });

  it("bimonthly steps 2 months with the anchor-indexed month-end rule", () => {
    expect(occurrenceAt("2026-01-31", "bimonthly", 1)).toBe("2026-03-31");
    expect(occurrenceAt("2026-12-31", "bimonthly", 1)).toBe("2027-02-28");
    expect(occurrenceAt("2026-12-31", "bimonthly", 2)).toBe("2027-04-30");
    expect(occurrenceAt("2026-12-31", "bimonthly", 3)).toBe("2027-06-30");
    expect(occurrenceAt("2024-12-31", "bimonthly", 1)).toBe("2025-02-28");
    expect(nextOnOrAfter("2026-01-15", "bimonthly", "2026-02-01")).toBe("2026-03-15");
    expect(occurrenceAt("2026-03-15", "bimonthly", -1)).toBe("2026-01-15");
  });

  it("monthly_eom is always the last day of the month", () => {
    expect(occurrenceAt("2026-01-31", "monthly_eom", 0)).toBe("2026-01-31");
    expect(occurrenceAt("2026-01-31", "monthly_eom", 1)).toBe("2026-02-28");
    expect(occurrenceAt("2026-01-31", "monthly_eom", 2)).toBe("2026-03-31");
    expect(occurrenceAt("2026-01-31", "monthly_eom", 3)).toBe("2026-04-30");
    expect(occurrenceAt("2024-01-31", "monthly_eom", 1)).toBe("2024-02-29");
    // A mid-month anchor still lands on month-ends.
    expect(occurrenceAt("2026-01-15", "monthly_eom", 0)).toBe("2026-01-31");
    expect(occurrenceAt("2026-01-15", "monthly_eom", 1)).toBe("2026-02-28");
    expect(occurrenceAt("2026-01-15", "monthly_eom", 12)).toBe("2027-01-31");
    expect(nextOnOrAfter("2026-01-15", "monthly_eom", "2026-02-01")).toBe("2026-02-28");
    expect(nextOnOrAfter("2026-01-15", "monthly_eom", "2026-02-28")).toBe("2026-02-28");
    expect(occurrencesBetween("2026-01-15", "monthly_eom", "2026-02-01", "2026-05-31")).toEqual([
      "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31",
    ]);
  });

  it("firstOccurrenceAfter is strictly after the booked date", () => {
    expect(firstOccurrenceAfter("2026-10-10", "monthly")).toBe("2026-11-10");
    expect(firstOccurrenceAfter("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(firstOccurrenceAfter("2026-01-31", "monthly_eom")).toBe("2026-02-28");
    expect(firstOccurrenceAfter("2026-01-15", "monthly_eom")).toBe("2026-01-31");
    expect(firstOccurrenceAfter("2026-10-10", "weekly")).toBe("2026-10-17");
    expect(firstOccurrenceAfter("2026-10-10", "every4weeks")).toBe("2026-11-07");
    expect(firstOccurrenceAfter("2026-10-10", "bimonthly")).toBe("2026-12-10");
    expect(firstOccurrenceAfter("bad", "monthly")).toBeNull();
  });
});

describe("subscription schedule — end conditions", () => {
  it("stops after endDate (inclusive)", () => {
    expect(
      occurrencesBetween("2026-01-10", "monthly", "2026-01-01", "2026-12-31", 400, { endDate: "2026-04-10" }),
    ).toEqual(["2026-01-10", "2026-02-10", "2026-03-10", "2026-04-10"]);
    expect(
      occurrencesBetween("2026-01-10", "monthly", "2026-01-01", "2026-12-31", 400, { endDate: "2026-04-09" }),
    ).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });

  it("stops after remainingCount counted from the anchor, and does not project backwards", () => {
    expect(
      occurrencesBetween("2026-03-10", "monthly", "2026-01-01", "2026-12-31", 400, { remainingCount: 3 }),
    ).toEqual(["2026-03-10", "2026-04-10", "2026-05-10"]);
    // Window starts mid-series: only the surviving ones.
    expect(
      occurrencesBetween("2026-03-10", "monthly", "2026-04-01", "2026-12-31", 400, { remainingCount: 3 }),
    ).toEqual(["2026-04-10", "2026-05-10"]);
    expect(
      occurrencesBetween("2026-03-10", "monthly", "2026-01-01", "2026-12-31", 400, { remainingCount: 0 }),
    ).toEqual([]);
  });

  it("applies the earlier of endDate and remainingCount; null means no limit", () => {
    expect(
      occurrencesBetween("2026-03-10", "monthly", "2026-03-01", "2026-12-31", 400, {
        endDate: "2026-04-30",
        remainingCount: 5,
      }),
    ).toEqual(["2026-03-10", "2026-04-10"]);
    expect(
      occurrencesBetween("2026-03-10", "monthly", "2026-03-01", "2026-05-31", 400, {
        endDate: null,
        remainingCount: null,
      }),
    ).toEqual(["2026-03-10", "2026-04-10", "2026-05-10"]);
    expect(isWithinEnd(0, "2026-03-10", undefined)).toBe(true);
    expect(isWithinEnd(2, "2026-05-10", { remainingCount: 2 })).toBe(false);
    expect(isWithinEnd(1, "2026-05-10", { remainingCount: 2 })).toBe(true);
  });
});

// 2026-10-09 is a Friday, 10 Sat, 11 Sun, 12 Mon.
describe("subscription schedule — daily / weekdays / weekend", () => {
  it("labels, suffixes, aliases and pricing", () => {
    expect(FREQUENCY_LABELS.daily).toBe("Every day");
    expect(FREQUENCY_LABELS.weekdays).toBe("Weekdays");
    expect(FREQUENCY_LABELS.weekend).toBe("Weekend");
    expect(FREQUENCY_SUFFIX.daily).toBe("day");
    expect(FREQUENCY_SUFFIX.weekdays).toBe("weekday");
    expect(FREQUENCY_SUFFIX.weekend).toBe("weekend day");
    for (const [raw, f] of [
      ["daily", "daily"], ["Every day", "daily"], ["everyday", "daily"],
      ["weekdays", "weekdays"], ["weekday", "weekdays"], ["Mon-Fri", "weekdays"],
      ["weekend", "weekend"], ["weekends", "weekend"], ["sat-sun", "weekend"],
    ] as const) {
      expect(normalizeFrequency(raw)).toBe(f);
    }
    expect(frequencyLabel("weekdays")).toBe("Weekdays");
    expect(annualEquivalent(1, "daily")).toBe(365);
    expect(annualEquivalent(1, "weekdays")).toBe(260);
    expect(annualEquivalent(1, "weekend")).toBe(104);
    expect(monthlyEquivalent(12, "daily")).toBeCloseTo(365, 10);
    expect(monthlyEquivalent(12, "weekdays")).toBeCloseTo(260, 10);
    expect(monthlyEquivalent(12, "weekend")).toBeCloseTo(104, 10);
  });

  it("occurrenceAt: daily steps one day, across month and year ends and leap days", () => {
    expect(occurrenceAt("2026-12-31", "daily", 1)).toBe("2027-01-01");
    expect(occurrenceAt("2028-02-28", "daily", 1)).toBe("2028-02-29");
    expect(occurrenceAt("2028-02-28", "daily", 2)).toBe("2028-03-01");
    expect(occurrenceAt("2026-10-10", "daily", -1)).toBe("2026-10-09");
  });

  it("occurrenceAt: weekdays skips Saturday and Sunday (Fri -> Mon)", () => {
    const seq = [0, 1, 2, 3, 4, 5, 6].map((k) => occurrenceAt("2026-10-09", "weekdays", k));
    expect(seq).toEqual(["2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"]);
    expect(occurrenceAt("2026-10-12", "weekdays", -1)).toBe("2026-10-09");
    expect(occurrenceAt("2026-10-12", "weekdays", -5)).toBe("2026-10-05");
    expect(occurrenceAt("2026-10-12", "weekdays", 260)).toBe("2027-10-11"); // 52 weeks
  });

  it("occurrenceAt: weekdays anchored on a weekend starts on the next Monday", () => {
    expect(occurrenceAt("2026-10-10", "weekdays", 0)).toBe("2026-10-12"); // Sat
    expect(occurrenceAt("2026-10-11", "weekdays", 0)).toBe("2026-10-12"); // Sun
    expect(occurrenceAt("2026-10-10", "weekdays", 1)).toBe("2026-10-13");
  });

  it("occurrenceAt: weekend yields Saturday then Sunday, forwards and backwards", () => {
    const seq = [0, 1, 2, 3, 4].map((k) => occurrenceAt("2026-10-10", "weekend", k));
    expect(seq).toEqual(["2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18", "2026-10-24"]);
    expect(occurrenceAt("2026-10-10", "weekend", -1)).toBe("2026-10-04");
    expect(occurrenceAt("2026-10-10", "weekend", -2)).toBe("2026-10-03");
    expect(occurrenceAt("2026-10-11", "weekend", 1)).toBe("2026-10-17"); // anchored on Sunday
    expect(occurrenceAt("2026-10-07", "weekend", 0)).toBe("2026-10-10"); // Wed anchor -> first Saturday
  });

  it("nextOnOrAfter honours the day set", () => {
    expect(nextOnOrAfter("2026-10-09", "weekdays", "2026-10-10")).toBe("2026-10-12");
    expect(nextOnOrAfter("2026-10-09", "weekdays", "2026-10-12")).toBe("2026-10-12");
    expect(nextOnOrAfter("2026-10-09", "weekdays", "2026-10-09")).toBe("2026-10-09");
    expect(nextOnOrAfter("2026-10-09", "weekdays", "2026-12-26")).toBe("2026-12-28"); // Sat -> Mon
    expect(nextOnOrAfter("2026-10-10", "weekend", "2026-10-12")).toBe("2026-10-17");
    expect(nextOnOrAfter("2026-10-10", "weekend", "2026-10-11")).toBe("2026-10-11");
    expect(nextOnOrAfter("2026-10-10", "weekend", "2026-10-05")).toBe("2026-10-10"); // before the anchor
    expect(nextOnOrAfter("2026-10-10", "daily", "2026-12-31")).toBe("2026-12-31");
  });

  it("firstOccurrenceAfter is strictly after the booked date", () => {
    expect(firstOccurrenceAfter("2026-10-09", "weekdays")).toBe("2026-10-12"); // Fri
    expect(firstOccurrenceAfter("2026-10-08", "weekdays")).toBe("2026-10-09");
    expect(firstOccurrenceAfter("2026-10-10", "weekdays")).toBe("2026-10-12"); // booked on a Saturday
    expect(firstOccurrenceAfter("2026-10-10", "weekend")).toBe("2026-10-11");
    expect(firstOccurrenceAfter("2026-10-11", "weekend")).toBe("2026-10-17");
    expect(firstOccurrenceAfter("2026-10-07", "weekend")).toBe("2026-10-10"); // booked on a weekday
    expect(firstOccurrenceAfter("2026-10-10", "daily")).toBe("2026-10-11");
    expect(firstOccurrenceAfter("2028-02-28", "daily")).toBe("2028-02-29");
  });

  it("occurrencesBetween lists only matching days, inclusive, projecting both ways", () => {
    expect(occurrencesBetween("2026-10-09", "weekdays", "2026-10-09", "2026-10-19")).toEqual([
      "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19",
    ]);
    expect(occurrencesBetween("2026-10-09", "weekend", "2026-10-01", "2026-10-18")).toEqual([
      "2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18",
    ]);
    expect(occurrencesBetween("2026-10-09", "daily", "2026-10-30", "2026-11-02")).toHaveLength(4);
    expect(occurrencesBetween("2026-10-09", "weekdays", "2026-10-10", "2026-10-11")).toEqual([]);
    expect(occurrencesBetween("2026-10-09", "weekdays", "2026-10-01", "2026-10-31")).toHaveLength(22);
  });

  it("end conditions count matching days from the anchor", () => {
    expect(occurrencesBetween("2026-10-09", "weekdays", "2026-10-01", "2026-12-31", 400, { remainingCount: 4 })).toEqual([
      "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14",
    ]);
    expect(occurrencesBetween("2026-10-10", "weekend", "2026-10-10", "2026-12-31", 400, { endDate: "2026-10-17" })).toEqual([
      "2026-10-10", "2026-10-11", "2026-10-17",
    ]);
    expect(isWithinEnd(3, occurrenceAt("2026-10-09", "weekdays", 3), { remainingCount: 4 })).toBe(true);
    expect(isWithinEnd(4, occurrenceAt("2026-10-09", "weekdays", 4), { remainingCount: 4 })).toBe(false);
    expect(isWithinEnd(0, "2026-10-12", { endDate: "2026-10-11" })).toBe(false);
  });

  it("rollForwardNextDate lands on a matching day", () => {
    expect(rollForwardNextDate("2026-10-09", "weekdays", "2026-10-10")).toBe("2026-10-12");
    expect(rollForwardNextDate("2026-10-03", "weekend", "2026-10-12")).toBe("2026-10-17");
    expect(rollForwardNextDate("2026-10-03", "daily", "2026-10-12")).toBe("2026-10-12");
    expect(rollForwardNextDate("2026-10-12", "weekdays", "2026-10-12")).toBe("2026-10-12");
  });

  it("occurrenceAt and firstIndex agree with a brute-force day walk over a year (incl. leap)", () => {
    for (const [f, ok] of [
      ["weekdays", (dow: number) => dow >= 1 && dow <= 5],
      ["weekend", (dow: number) => dow === 0 || dow === 6],
      ["daily", () => true],
    ] as const) {
      const anchor = "2027-12-29";
      const expected: string[] = [];
      for (let i = 0; i < 400; i++) {
        const d = addDays(anchor, i);
        if (ok(new Date(d + "T00:00:00Z").getUTCDay())) expected.push(d);
      }
      for (let k = 0; k < 60; k++) expect(occurrenceAt(anchor, f, k)).toBe(expected[k]);
      expect(occurrencesBetween(anchor, f, anchor, addDays(anchor, 399))).toEqual(expected);
    }
  });
});

describe("subscription schedule — anchor-indexed advance (month-end)", () => {
  it("Jan 31 monthly: Feb 28 -> Mar 31 -> Apr 30 by index from the anchor", () => {
    expect(occurrenceFromNext("2026-01-31", "2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceFromNext("2026-01-31", "2026-02-28", "monthly", 1)).toBe("2026-03-31");
    expect(occurrenceFromNext("2026-01-31", "2026-03-31", "monthly", 1)).toBe("2026-04-30");
    expect(occurrenceFromNext("2026-01-31", "2026-02-28", "monthly", 2)).toBe("2026-04-30");
    expect(occurrenceFromNext("2026-01-31", "2026-02-28", "monthly", 0)).toBe("2026-02-28");
  });

  it("leap years: Feb 29 and back to the 31st", () => {
    expect(occurrenceFromNext("2028-01-31", "2028-01-31", "monthly", 1)).toBe("2028-02-29");
    expect(occurrenceFromNext("2028-01-31", "2028-02-29", "monthly", 1)).toBe("2028-03-31");
    // a Feb 29 anchor lands on Feb 28 in a non-leap year and back on Feb 29 four years on
    expect(occurrenceFromNext("2028-02-29", "2028-02-29", "annual", 1)).toBe("2029-02-28");
    expect(occurrenceFromNext("2028-02-29", "2029-02-28", "annual", 3)).toBe("2032-02-29");
  });

  it("without an anchor it falls back to next_date (old behaviour)", () => {
    expect(occurrenceFromNext(null, "2026-02-28", "monthly", 1)).toBe("2026-03-28");
    expect(occurrenceFromNext(undefined, "2026-02-28", "monthly", 1)).toBe("2026-03-28");
    expect(occurrenceFromNext("", "2026-02-28", "monthly", 1)).toBe("2026-03-28");
    expect(occurrenceFromNext("garbage", "2026-02-28", "monthly", 1)).toBe("2026-03-28");
  });

  it("a stale anchor (next_date edited off the series) is ignored", () => {
    expect(occurrenceFromNext("2026-01-31", "2026-03-05", "monthly", 1)).toBe("2026-04-05");
    expect(effectiveAnchor("2026-01-31", "2026-03-05", "monthly")).toBe("2026-03-05");
    expect(effectiveAnchor("2026-01-31", "2026-02-28", "monthly")).toBe("2026-01-31");
    expect(effectiveAnchor(null, "2026-02-28", "monthly")).toBe("2026-02-28");
  });

  it("weekly / biweekly / every4weeks are unaffected by the anchor", () => {
    for (const [f, days] of [["weekly", 7], ["biweekly", 14], ["every4weeks", 28]] as const) {
      expect(occurrenceFromNext("2026-01-31", "2026-02-14", f, 1)).toBe(addDays("2026-02-14", days));
      expect(occurrenceFromNext(null, "2026-02-14", f, 1)).toBe(addDays("2026-02-14", days));
      expect(occurrenceFromNext("2026-01-31", "2026-02-14", f, 3)).toBe(addDays("2026-02-14", days * 3));
    }
  });

  it("other month cadences keep the day: quarterly, bimonthly, annual, monthly_eom", () => {
    expect(occurrenceFromNext("2026-01-31", "2026-01-31", "bimonthly", 1)).toBe("2026-03-31");
    expect(occurrenceFromNext("2026-01-31", "2026-01-31", "quarterly", 1)).toBe("2026-04-30");
    expect(occurrenceFromNext("2026-01-31", "2026-04-30", "quarterly", 1)).toBe("2026-07-31");
    expect(occurrenceFromNext("2026-01-15", "2026-01-31", "monthly_eom", 1)).toBe("2026-02-28");
    expect(occurrenceFromNext("2026-01-15", "2026-02-28", "monthly_eom", 1)).toBe("2026-03-31");
  });

  it("weekdays / weekend advance from the anchor too", () => {
    expect(occurrenceFromNext("2026-10-09", "2026-10-09", "weekdays", 1)).toBe("2026-10-12");
    expect(occurrenceFromNext(null, "2026-10-09", "weekdays", 1)).toBe("2026-10-12");
    expect(occurrenceFromNext("2026-10-10", "2026-10-11", "weekend", 1)).toBe("2026-10-17");
    // next_date edited to a Saturday on a weekdays series: the very next weekday is Monday
    expect(occurrenceFromNext(null, "2026-10-10", "weekdays", 1)).toBe("2026-10-12");
    expect(occurrenceFromNext("2026-10-09", "2026-10-10", "weekdays", 1)).toBe("2026-10-12");
    expect(occurrenceFromNext(null, "2026-10-10", "weekdays", 2)).toBe("2026-10-13");
  });

  it("stepsToOnOrAfter counts skipped occurrences consistently with occurrenceFromNext", () => {
    expect(stepsToOnOrAfter("2026-01-31", "2026-02-28", "monthly", "2026-06-15")).toBe(4); // Mar31 Apr30 May31 Jun30
    expect(occurrenceFromNext("2026-01-31", "2026-02-28", "monthly", 4)).toBe("2026-06-30");
    expect(stepsToOnOrAfter("2026-01-31", "2026-02-28", "monthly", "2026-03-31")).toBe(1);
    expect(stepsToOnOrAfter("2026-01-31", "2026-02-28", "monthly", "2026-02-28")).toBe(0);
    expect(stepsToOnOrAfter("2026-01-31", "2026-02-28", "monthly", "2026-01-01")).toBe(0);
    expect(stepsToOnOrAfter("2026-10-09", "2026-10-09", "weekdays", "2026-10-20")).toBe(7); // 12,13,14,15,16,19,20
    expect(stepsToOnOrAfter("2026-10-10", "2026-10-10", "weekend", "2026-10-12")).toBe(2); // 11, 17
  });

  it("rollForwardNextDate with an anchor rolls Feb 28 to Mar 31, not Mar 28", () => {
    expect(rollForwardNextDate("2026-02-28", "monthly", "2026-03-10", "2026-01-31")).toBe("2026-03-31");
    expect(rollForwardNextDate("2026-02-28", "monthly", "2026-03-10")).toBe("2026-03-28");
    expect(rollForwardNextDate("2026-02-28", "monthly", "2026-03-10", null)).toBe("2026-03-28");
    expect(rollForwardNextDate("2026-03-31", "monthly", "2026-03-10", "2026-01-31")).toBe("2026-03-31");
  });
});
