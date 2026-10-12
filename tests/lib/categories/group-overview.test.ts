import { describe, it, expect } from "vitest";
import type { OverviewCategory } from "@/lib/reports/category-overview";
import { buildGroupRows, pieSlices, subLabel, sumSeries, findRow } from "@/lib/categories/group-overview";

function cat(p: Partial<OverviewCategory> & { id: number; group: string; amount: number }): OverviewCategory {
  return { name: `C${p.id}`, average: null, change: null, budget: null, share: 0, trend: [0, 0, p.amount], ...p };
}

describe("buildGroupRows", () => {
  const cats: OverviewCategory[] = [
    cat({ id: 1, name: "Housing - Rent", group: "Housing", amount: 600, average: 600, budget: 700, trend: [600, 600, 600] }),
    cat({ id: 2, name: "Housing - Utilities", group: "Housing", amount: 200, average: 100, budget: null, trend: [100, 100, 200] }),
    cat({ id: 3, name: "Food", group: "Lifestyle", amount: 500, average: 450, trend: [400, 450, 500] }),
    cat({ id: 4, name: "Health", group: "", amount: 200, average: null, trend: [0, 0, 200] }),
  ];
  const rows = buildGroupRows(cats, 1500);

  it("one level-1 row per group, summing amounts, share and usual", () => {
    const housing = rows.find((r) => r.key === "g:Housing")!;
    expect(housing.kind).toBe("group");
    expect(housing.amount).toBe(800);
    expect(housing.share).toBeCloseTo(800 / 1500);
    expect(housing.average).toBe(700);
    expect(housing.change).toBeCloseTo((800 - 700) / 700);
    expect(housing.budget).toBe(700);
    expect(housing.trend).toEqual([700, 700, 800]);
    expect(housing.categories.map((c) => c.id)).toEqual([1, 2]);
  });

  it("ungrouped categories are their own level-1 rows, not grouped", () => {
    const health = rows.find((r) => r.key === "c:4")!;
    expect(health.kind).toBe("category");
    expect(health.label).toBe("Health");
    expect(health.categories.map((c) => c.id)).toEqual([4]);
    expect(rows.some((r) => r.key === "g:")).toBe(false);
  });

  it("sorts level-1 rows by amount desc", () => {
    expect(rows.map((r) => r.label)).toEqual(["Housing", "Lifestyle", "Health"]);
  });

  it("change ignores members with no usual average, and a group with none has no change", () => {
    const mixed = buildGroupRows(
      [
        cat({ id: 10, group: "G", amount: 300, average: 200 }),
        cat({ id: 11, group: "G", amount: 100, average: null }),
      ],
      400,
    )[0];
    expect(mixed.average).toBe(200);
    expect(mixed.amount).toBe(400);
    expect(mixed.change).toBeCloseTo((300 - 200) / 200);
    const none = buildGroupRows([cat({ id: 12, group: "N", amount: 50, average: null })], 50)[0];
    expect(none.average).toBeNull();
    expect(none.change).toBeNull();
  });

  it("budget is null when no member has one; trend is null when no series", () => {
    const r = buildGroupRows([cat({ id: 20, group: "X", amount: 5, trend: [] })], 5)[0];
    expect(r.budget).toBeNull();
    expect(r.trend).toBeNull();
  });

  it("findRow looks up by key", () => {
    expect(findRow(rows, "g:Lifestyle")?.label).toBe("Lifestyle");
    expect(findRow(rows, "g:Nope")).toBeNull();
    expect(findRow(rows, null)).toBeNull();
  });
});

describe("subLabel", () => {
  it("drops the redundant '<group> - ' prefix only", () => {
    expect(subLabel("Housing - Rent", "Housing")).toBe("Rent");
    expect(subLabel("Housing Rent", "Housing")).toBe("Housing Rent");
    expect(subLabel("Rent", "")).toBe("Rent");
    expect(subLabel(null, "Housing")).toBe("Category");
  });
});

describe("pieSlices and sumSeries", () => {
  it("keeps the top N active rows and sums the rest as Other", () => {
    const cats = Array.from({ length: 9 }, (_, i) => cat({ id: i + 1, group: `G${i}`, amount: 100 - i }));
    const rows = buildGroupRows(cats, 900);
    const { slices, other } = pieSlices(rows, 7);
    expect(slices.length).toBe(7);
    expect(other).toBe(93 + 92);
  });

  it("no Other when everything fits", () => {
    const rows = buildGroupRows([cat({ id: 1, group: "A", amount: 10 })], 10);
    expect(pieSlices(rows, 7)).toEqual({ slices: rows, other: 0 });
  });

  it("sumSeries adds element-wise and treats short series as 0", () => {
    expect(sumSeries([[1, 2, 3], [10, 20]])).toEqual([11, 22, 3]);
    expect(sumSeries([])).toBeNull();
  });
});
