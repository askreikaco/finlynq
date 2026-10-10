import { describe, it, expect } from "vitest";
import {
  InstallmentPlanError,
  MAX_INSTALLMENTS,
  planInstallments,
} from "@/lib/transactions/installment-plan";

const sum = (p: { amountMinor: number }[]) => p.reduce((a, r) => a + r.amountMinor, 0);

describe("planInstallments", () => {
  it("split: 6 x 83.33 with the remainder on the last payment, sum equals the total", () => {
    const p = planInstallments({ startDate: "2026-01-10", count: 6, mode: "split", amount: 500, currency: "USD" });
    expect(p.map((r) => r.amountMinor)).toEqual([8333, 8333, 8333, 8333, 8333, 8335]);
    expect(sum(p)).toBe(50000);
    expect(p.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p[0].date).toBe("2026-01-10");
    expect(p[5].date).toBe("2026-06-10");
  });

  it("split: exact division has no remainder", () => {
    const p = planInstallments({ startDate: "2026-01-10", count: 4, mode: "split", amount: 100, currency: "USD" });
    expect(p.map((r) => r.amountMinor)).toEqual([2500, 2500, 2500, 2500]);
  });

  it("each: every payment equals the amount", () => {
    const p = planInstallments({ startDate: "2026-01-10", count: 3, mode: "each", amount: 33.33, currency: "USD" });
    expect(p.map((r) => r.amountMinor)).toEqual([3333, 3333, 3333]);
  });

  it("ignores the sign of the amount (caller applies it)", () => {
    const p = planInstallments({ startDate: "2026-01-10", count: 2, mode: "split", amount: -10, currency: "USD" });
    expect(p.map((r) => r.amountMinor)).toEqual([500, 500]);
  });

  it("month-end dates are anchor-indexed: Jan 31 -> Feb 28 -> Mar 31 -> Apr 30", () => {
    const p = planInstallments({ startDate: "2026-01-31", count: 4, mode: "each", amount: 1, currency: "USD" });
    expect(p.map((r) => r.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("leap-year February and year rollover", () => {
    const p = planInstallments({ startDate: "2023-12-31", count: 3, mode: "each", amount: 1, currency: "USD" });
    expect(p.map((r) => r.date)).toEqual(["2023-12-31", "2024-01-31", "2024-02-29"]);
  });

  it("zero-decimal currencies (VND, JPY) work in whole units", () => {
    const vnd = planInstallments({ startDate: "2026-01-10", count: 3, mode: "split", amount: 1000, currency: "VND" });
    expect(vnd.map((r) => r.amountMinor)).toEqual([333, 333, 334]);
    expect(sum(vnd)).toBe(1000);
    const jpy = planInstallments({ startDate: "2026-01-10", count: 12, mode: "split", amount: 100000, currency: "JPY" });
    expect(sum(jpy)).toBe(100000);
    expect(jpy[0].amountMinor).toBe(8333);
    expect(jpy[11].amountMinor).toBe(100000 - 8333 * 11);
  });

  it("sums equal the total for many counts and awkward totals", () => {
    for (let count = 2; count <= MAX_INSTALLMENTS; count++) {
      for (const total of [0.07, 1, 99.99, 1234.56, 0.1 + 0.2]) {
        if (Math.floor(Math.round(total * 100) / count) <= 0) continue;
        const p = planInstallments({ startDate: "2026-01-10", count, mode: "split", amount: total, currency: "USD" });
        expect(sum(p)).toBe(Math.round(total * 100));
        expect(p[count - 1].amountMinor).toBeGreaterThanOrEqual(p[0].amountMinor);
      }
    }
  });

  it("count bounds 2..60", () => {
    const mk = (count: number) => () =>
      planInstallments({ startDate: "2026-01-10", count, mode: "each", amount: 1, currency: "USD" });
    expect(mk(1)).toThrow(InstallmentPlanError);
    expect(mk(0)).toThrow(InstallmentPlanError);
    expect(mk(61)).toThrow(InstallmentPlanError);
    expect(mk(2.5)).toThrow(InstallmentPlanError);
    expect(mk(2)().length).toBe(2);
    expect(mk(60)().length).toBe(60);
  });

  it("rejects bad input", () => {
    const base = { startDate: "2026-01-10", count: 3, mode: "split" as const, amount: 30, currency: "USD" };
    expect(() => planInstallments({ ...base, startDate: "nope" })).toThrow(InstallmentPlanError);
    expect(() => planInstallments({ ...base, amount: 0 })).toThrow(InstallmentPlanError);
    expect(() => planInstallments({ ...base, amount: NaN })).toThrow(InstallmentPlanError);
    expect(() => planInstallments({ ...base, mode: "x" as never })).toThrow(InstallmentPlanError);
    // total too small to give each payment a minor unit
    expect(() => planInstallments({ ...base, amount: 0.02 })).toThrow(InstallmentPlanError);
  });
});
