// Every MetricItem carries a real lucide icon: no placeholder '#' (Hash) tile and no optional icon.
import { describe, it, expect } from "vitest";
import * as fs from "fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("metric icons", () => {
  const grid = read("src/components/mobile/metric-grid.tsx");

  it("metric-grid.tsx has no Hash placeholder", () => {
    expect(grid).not.toMatch(/\bHash\b/);
  });

  it("MetricItem.icon is required", () => {
    expect(grid).toMatch(/^\s*icon: LucideIcon;/m);
    expect(grid).not.toMatch(/icon\?: LucideIcon/);
    expect(grid).not.toMatch(/\?\?\s*Hash/);
  });

  it("casts that bypass the type check still carry icons (portfolio summary)", () => {
    const src = read("src/app/(app)/portfolio/_components/mobile-portfolio.tsx");
    const bad = src.split("\n").filter((l) => /\{\s*(icon:\s*\w+,\s*)?label: "/.test(l) && !/icon: \w+, label:/.test(l));
    expect(bad).toEqual([]);
  });
});

describe("no-history cards stay captioned, never invented", () => {
  it("goals / loans / budgets / dashboard budgets fall back to NO_HISTORY_CAPTION when no delta is derivable", () => {
    for (const p of ["goals", "loans", "budgets", "dashboard"]) {
      const src = read(`src/app/(app)/${p}/page.tsx`);
      expect(src, p).toContain("NO_HISTORY_CAPTION");
    }
    expect(read("src/lib/metrics/delta.ts")).toContain('NO_HISTORY_CAPTION = "No earlier history to compare"');
  });

  it("the dashboard range control is one slim right-aligned row", () => {
    expect(read("src/app/(app)/dashboard/page.tsx")).toMatch(/data-slot="dashboard-range"/);
  });
});
