import { describe, it, expect } from "vitest";
import {
  buildRepeatBody,
  installmentPreview,
  seriesErrorMessage,
  seriesSummary,
  shortDate,
  REPEAT_OPTIONS,
  repeatLabel,
  isValidInterval,
  type Series,
} from "@/lib/transactions/series";
import { SUBSCRIPTION_FREQUENCIES } from "@/lib/subscriptions/schedule";

describe("seriesSummary (pill text)", () => {
  it("names a forever repeat by its frequency", () => {
    expect(seriesSummary({ kind: "repeat", frequency: "daily", end: { type: "forever" } })).toBe("Daily");
    expect(seriesSummary({ kind: "repeat", frequency: "weekly", end: { type: "forever" } })).toBe("Weekly");
    expect(seriesSummary({ kind: "repeat", frequency: "monthly", end: { type: "forever" } })).toBe("Monthly");
    expect(seriesSummary({ kind: "repeat", frequency: "quarterly", end: { type: "forever" } })).toBe("Quarterly");
    expect(seriesSummary({ kind: "repeat", frequency: "annual", end: { type: "forever" } })).toBe("Annually");
  });
  it("reads a custom interval as 'Every N days' (1 day is just Daily)", () => {
    const f = "every_n_days" as const;
    expect(seriesSummary({ kind: "repeat", frequency: f, intervalDays: 3, end: { type: "forever" } })).toBe("Every 3 days");
    expect(seriesSummary({ kind: "repeat", frequency: f, intervalDays: 365, end: { type: "forever" } })).toBe("Every 365 days");
    expect(seriesSummary({ kind: "repeat", frequency: f, intervalDays: 1, end: { type: "forever" } })).toBe("Daily");
    expect(seriesSummary({ kind: "repeat", frequency: f, intervalDays: 10, end: { type: "count", count: 5 } })).toBe("Every 10 days · 5×");
    expect(seriesSummary({ kind: "repeat", frequency: f, intervalDays: 2, end: { type: "until", date: "2026-12-31" } })).toBe(
      "Every 2 days until 31 Dec 2026",
    );
  });
  it("adds the count or the end date", () => {
    expect(seriesSummary({ kind: "repeat", frequency: "weekly", end: { type: "count", count: 12 } })).toBe("Weekly · 12×");
    expect(seriesSummary({ kind: "repeat", frequency: "monthly", end: { type: "until", date: "2026-12-31" } })).toBe(
      "Monthly until 31 Dec 2026",
    );
  });
  it("still labels cadences that only exist on older rows / MCP", () => {
    expect(seriesSummary({ kind: "repeat", frequency: "monthly_eom", end: { type: "forever" } })).toBe("Last day of month");
    expect(seriesSummary({ kind: "repeat", frequency: "biweekly", end: { type: "count", count: 12 } })).toBe("Every 2 weeks · 12×");
    expect(seriesSummary({ kind: "repeat", frequency: "weekdays", end: { type: "forever" } })).toBe("Weekdays");
  });
  it("counts installments", () => {
    expect(seriesSummary({ kind: "installment", count: 6, mode: "split" })).toBe("6 installments");
  });
  it("formats dates without a timezone", () => {
    expect(shortDate("2027-01-05")).toBe("5 Jan 2027");
    expect(shortDate("2027-01-05", false)).toBe("5 Jan");
  });
});

describe("repeat list", () => {
  it("is ONE flat list in the owner's order", () => {
    expect(REPEAT_OPTIONS).toEqual([
      { value: "none", label: "No repeat" },
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" },
      { value: "quarterly", label: "Quarterly" },
      { value: "annual", label: "Annually" },
      { value: "every_n_days", label: "Custom" },
    ]);
  });
  it("every offered value except 'none' is a real engine frequency", () => {
    for (const o of REPEAT_OPTIONS) if (o.value !== "none") expect(SUBSCRIPTION_FREQUENCIES).toContain(o.value);
  });
  it("labels every engine frequency", () => {
    for (const f of SUBSCRIPTION_FREQUENCIES) expect(repeatLabel(f, 4)).toBeTruthy();
  });
  it("validates the interval 1..365 as a whole number", () => {
    expect([1, 2, 365].every(isValidInterval)).toBe(true);
    for (const bad of [0, 366, 1.5, NaN, -1, null, undefined, "3"]) expect(isValidInterval(bad)).toBe(false);
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

describe("buildRepeatBody: custom interval", () => {
  it("sends intervalDays only with every_n_days", () => {
    expect(buildRepeatBody({ kind: "repeat", frequency: "every_n_days", intervalDays: 10, end: { type: "forever" } })).toEqual({
      frequency: "every_n_days",
      intervalDays: 10,
      end: { type: "forever" },
    });
    expect(buildRepeatBody({ kind: "repeat", frequency: "daily", intervalDays: 10, end: { type: "forever" } })).toEqual({
      frequency: "daily",
      end: { type: "forever" },
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
