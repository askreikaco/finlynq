import { describe, it, expect } from "vitest";
import { deriveSeriesChange } from "@/lib/dashboard/series-change";

describe("deriveSeriesChange", () => {
  it("accumulates deltas and reports change vs the previous month", () => {
    const r = deriveSeriesChange([
      { month: "2024-01", cumulative: 100 },
      { month: "2024-02", cumulative: 50 },
      { month: "2024-03", cumulative: 50 },
    ]);
    expect(r.sparkData).toEqual([100, 150, 200]);
    expect(r.sparkLabels).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(r.change).toBe(50);
    expect(r.changePct).toBeCloseTo((50 / 150) * 100);
  });

  it("uses |previous| for negative series (liabilities)", () => {
    const r = deriveSeriesChange([
      { month: "2024-01", cumulative: -100 },
      { month: "2024-02", cumulative: -50 },
    ]);
    expect(r.change).toBe(-50);
    expect(r.changePct).toBeCloseTo(-50);
  });

  it("returns no change with fewer than 2 months or empty input", () => {
    expect(deriveSeriesChange([{ month: "2024-01", cumulative: 5 }])).toMatchObject({ change: null, changePct: 0, sparkData: [5] });
    expect(deriveSeriesChange([])).toMatchObject({ change: null, changePct: 0, sparkData: [], sparkLabels: [] });
    expect(deriveSeriesChange(undefined).points).toEqual([]);
  });

  it("changePct is 0 when previous is 0", () => {
    const r = deriveSeriesChange([
      { month: "2024-01", cumulative: 0 },
      { month: "2024-02", cumulative: 10 },
    ]);
    expect(r.change).toBe(10);
    expect(r.changePct).toBe(0);
  });

  it("caps points to 24 and spark to 12 months", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ month: `m${String(i).padStart(2, "0")}`, cumulative: 1 }));
    const r = deriveSeriesChange(rows);
    expect(r.points).toHaveLength(24);
    expect(r.sparkData).toHaveLength(12);
    expect(r.sparkData[11]).toBe(30);
  });

  it("merges rows sharing a month (last running total wins)", () => {
    const r = deriveSeriesChange([
      { month: "2024-01", cumulative: 1 },
      { month: "2024-01", cumulative: 2 },
    ]);
    expect(r.points).toEqual([{ month: "2024-01", value: 3 }]);
  });
});
