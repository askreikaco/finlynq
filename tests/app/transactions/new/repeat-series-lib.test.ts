import { describe, it, expect } from "vitest";
import {
  buildRepeatBody,
  installmentPreview,
  seriesErrorMessage,
  seriesSummary,
  shortDate,
  REPEAT_GROUPS,
  repeatLabel,
  type Series,
} from "@/lib/transactions/series";
import { SUBSCRIPTION_FREQUENCIES } from "@/lib/subscriptions/schedule";

describe("seriesSummary (pill text)", () => {
  it("names a forever repeat by its frequency", () => {
    expect(seriesSummary({ kind: "repeat", frequency: "monthly", end: { type: "forever" } })).toBe("Monthly");
    expect(seriesSummary({ kind: "repeat", frequency: "monthly_eom", end: { type: "forever" } })).toBe("Last day of month");
    expect(seriesSummary({ kind: "repeat", frequency: "annual", end: { type: "forever" } })).toBe("Annually");
  });
  it("adds the count or the end date", () => {
    expect(seriesSummary({ kind: "repeat", frequency: "biweekly", end: { type: "count", count: 12 } })).toBe("Every 2 weeks · 12×");
    expect(seriesSummary({ kind: "repeat", frequency: "monthly", end: { type: "until", date: "2026-12-31" } })).toBe(
      "Monthly until 31 Dec 2026",
    );
  });
  it("counts installments", () => {
    expect(seriesSummary({ kind: "installment", count: 6, mode: "split" })).toBe("6 installments");
  });
  it("formats dates without a timezone", () => {
    expect(shortDate("2027-01-05")).toBe("5 Jan 2027");
    expect(shortDate("2027-01-05", false)).toBe("5 Jan");
  });
});

describe("repeat list: Daily group", () => {
  it("is the first group, ahead of Weekly, with Every day / Weekdays / Weekend", () => {
    expect(REPEAT_GROUPS.map((g) => g.title)).toEqual(["Daily", "Weekly", "Monthly", "Yearly"]);
    expect(REPEAT_GROUPS[0].options).toEqual([
      { frequency: "daily", label: "Every day" },
      { frequency: "weekdays", label: "Weekdays" },
      { frequency: "weekend", label: "Weekend" },
    ]);
  });
  it("summaries, labels and API body for the daily cadences", () => {
    expect(repeatLabel("daily")).toBe("Every day");
    expect(repeatLabel("weekdays")).toBe("Weekdays");
    expect(repeatLabel("weekend")).toBe("Weekend");
    expect(seriesSummary({ kind: "repeat", frequency: "weekdays", end: { type: "forever" } })).toBe("Weekdays");
    expect(seriesSummary({ kind: "repeat", frequency: "daily", end: { type: "count", count: 30 } })).toBe("Every day · 30×");
    expect(seriesSummary({ kind: "repeat", frequency: "weekend", end: { type: "until", date: "2026-12-31" } })).toBe("Weekend until 31 Dec 2026");
    expect(buildRepeatBody({ kind: "repeat", frequency: "weekend", end: { type: "forever" } })).toEqual({ frequency: "weekend", end: { type: "forever" } });
  });
});

describe("repeat list", () => {
  it("offers every API frequency exactly once", () => {
    const all = REPEAT_GROUPS.flatMap((g) => g.options.map((o) => o.frequency)).sort();
    expect(all).toEqual([...SUBSCRIPTION_FREQUENCIES].sort());
  });
});

describe("buildRepeatBody", () => {
  it("maps the three end conditions", () => {
    const base = { kind: "repeat", frequency: "quarterly" } as const;
    expect(buildRepeatBody({ ...base, end: { type: "forever" } })).toEqual({ frequency: "quarterly", end: { type: "forever" } });
    expect(buildRepeatBody({ ...base, end: { type: "until", date: "2027-01-01" } })).toEqual({
      frequency: "quarterly",
      end: { type: "until", date: "2027-01-01" },
    });
    expect(buildRepeatBody({ ...base, end: { type: "count", count: 4 } })).toEqual({
      frequency: "quarterly",
      end: { type: "count", count: 4 },
    });
  });
});

describe("installmentPreview", () => {
  it("shows N x amount and the date range", () => {
    const p = installmentPreview({ startDate: "2027-01-10", count: 6, mode: "split", amount: 500, currency: "USD" });
    // 500 / 6 = 83.33 with a 0.02 remainder on the last payment
    expect(p.ok).toBe(true);
    expect(p.text).toBe("5 × $83.33, last $83.35, 10 Jan – 10 Jun 2027");
  });
  it("collapses to N x amount when every payment is equal", () => {
    const p = installmentPreview({ startDate: "2027-01-10", count: 6, mode: "split", amount: 600, currency: "USD" });
    expect(p.text).toBe("6 × $100.00, 10 Jan – 10 Jun 2027");
    const each = installmentPreview({ startDate: "2027-01-10", count: 3, mode: "each", amount: 50, currency: "USD" });
    expect(each.text).toBe("3 × $50.00, 10 Jan – 10 Mar 2027");
  });
  it("shows both years when the plan crosses New Year and follows month-end clamping", () => {
    const p = installmentPreview({ startDate: "2026-11-30", count: 4, mode: "each", amount: 10, currency: "USD" });
    expect(p.text).toBe("4 × $10.00, 30 Nov 2026 – 28 Feb 2027");
  });
  it("uses zero-decimal currencies", () => {
    const p = installmentPreview({ startDate: "2027-01-10", count: 3, mode: "split", amount: 100, currency: "VND" });
    expect(p.text).toContain("2 ×");
    expect(p.text).toContain("last");
  });
  it("asks for an amount first", () => {
    const p = installmentPreview({ startDate: "2027-01-10", count: 6, mode: "split", amount: 0, currency: "USD" });
    expect(p.ok).toBe(false);
    expect(p.text).toMatch(/Enter an amount/);
  });
});

describe("seriesErrorMessage", () => {
  const msg = (status: number, body: Record<string, unknown> | null) => seriesErrorMessage(status, body, "fallback", "USD");
  it("maps the documented server codes", () => {
    expect(msg(400, { code: "repeat_requires_payee" })).toBe("Repeat needs a payee");
    expect(msg(400, { code: "repeat_end_before_first" })).toMatch(/end date is before the first repeat/);
    expect(msg(400, { code: "repeat_not_supported" })).toMatch(/not available/);
    expect(msg(409, { code: "repeat_subscription_name_conflict" })).toMatch(/subscription with this payee name already exists/);
    expect(msg(400, { code: "invalid_plan", error: "count must be an integer from 2 to 60" })).toBe(
      "count must be an integer from 2 to 60",
    );
    expect(msg(409, { code: "fx-currency-needs-override", currency: "VND" })).toBe("No FX rate for VND.");
    expect(msg(423, {})).toBe("Unlock your data to make changes");
  });
  it("falls back to the server error, then the generic text", () => {
    expect(msg(500, { error: "boom" })).toBe("boom");
    expect(msg(500, null)).toBe("fallback");
  });
});

describe("types", () => {
  it("a Series union compiles for both kinds", () => {
    const a: Series = { kind: "installment", count: 2, mode: "each" };
    expect(a.kind).toBe("installment");
  });
});
