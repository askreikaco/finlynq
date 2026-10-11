import { describe, it, expect } from "vitest";
import { deriveBalanceMonthly } from "@/lib/accounts/balance-series";

describe("deriveBalanceMonthly", () => {
  it("keeps each month's last balance, oldest first, and compares latest vs previous month", () => {
    const r = deriveBalanceMonthly([
      { date: "2026-08-10", value: 100 },
      { date: "2026-08-31", value: 200 },
      { date: "2026-09-15", value: 250 },
      { date: "2026-09-30", value: 300 },
      { date: "2026-10-11", value: 330 },
    ]);
    expect(r.sparkLabels).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(r.sparkData).toEqual([200, 300, 330]);
    expect(r.changePct).toBeCloseTo(10, 5);
  });

  it("sorts unordered input and uses |previous| for negative balances", () => {
    const r = deriveBalanceMonthly([
      { date: "2026-10-05", value: -50 },
      { date: "2026-09-30", value: -100 },
    ]);
    expect(r.sparkData).toEqual([-100, -50]);
    expect(r.changePct).toBeCloseTo(50, 5);
  });

  it("has no percent with one month, or when the previous month was zero", () => {
    expect(deriveBalanceMonthly([{ date: "2026-10-01", value: 5 }]).changePct).toBeNull();
    expect(
      deriveBalanceMonthly([
        { date: "2026-09-30", value: 0 },
        { date: "2026-10-01", value: 5 },
      ]).changePct,
    ).toBeNull();
  });

  it("handles empty, null and junk input", () => {
    expect(deriveBalanceMonthly(null)).toEqual({ sparkData: [], sparkLabels: [], changePct: null });
    expect(deriveBalanceMonthly([{ date: "x", value: 1 }, { date: "2026-10-01", value: NaN }]).sparkData).toEqual([]);
  });

  it("caps to the last sparkMonths", () => {
    const pts = Array.from({ length: 14 }, (_, i) => ({ date: `2026-${String((i % 12) + 1).padStart(2, "0")}-01`, value: i }));
    expect(deriveBalanceMonthly(pts, { sparkMonths: 3 }).sparkData.length).toBeLessThanOrEqual(3);
  });
});
