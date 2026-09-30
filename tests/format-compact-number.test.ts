/**
 * FINLYNQ-247 — `formatCompactNumber`, the single shared "K"/"M"/"B" chart
 * Y-axis abbreviation helper (see src/lib/utils/number.ts). Bare output, NO
 * currency symbol — currency stays a chart-level label, not a per-tick
 * concern. Decimal rules: 0 decimals at/above 10k, 1 decimal for 1k-10k,
 * 1 decimal for millions and above.
 */
import { describe, it, expect } from "vitest";
import { formatCompactNumber } from "@/lib/utils/number";

describe("formatCompactNumber", () => {
  it("abbreviates thousands with 'K'", () => {
    expect(formatCompactNumber(572345)).toBe("572K");
    expect(formatCompactNumber(1500)).toBe("1.5K");
    expect(formatCompactNumber(9999)).toBe("10.0K");
    expect(formatCompactNumber(10000)).toBe("10K");
  });

  it("abbreviates millions with 'M'", () => {
    expect(formatCompactNumber(1_240_000)).toBe("1.2M");
    expect(formatCompactNumber(1_000_000)).toBe("1.0M");
    expect(formatCompactNumber(25_600_000)).toBe("25.6M");
    expect(formatCompactNumber(54_300_000)).toBe("54.3M");
  });

  it("abbreviates billions with 'B'", () => {
    expect(formatCompactNumber(2_500_000_000)).toBe("2.5B");
    expect(formatCompactNumber(1_240_000_000)).toBe("1.2B");
  });

  it("leaves sub-1000 values as a plain rounded string", () => {
    expect(formatCompactNumber(850)).toBe("850");
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(12.7)).toBe("13");
  });

  it("is 0-safe", () => {
    expect(formatCompactNumber(0)).toBe("0");
  });

  it("is negative-safe — sign carried through, magnitude rules on |n|", () => {
    expect(formatCompactNumber(-572345)).toBe("-572K");
    expect(formatCompactNumber(-1_240_000)).toBe("-1.2M");
    expect(formatCompactNumber(-2_500_000_000)).toBe("-2.5B");
    expect(formatCompactNumber(-850)).toBe("-850");
    expect(formatCompactNumber(-1500)).toBe("-1.5K");
  });
});
