// Every metric Card carries a real lucide icon: no placeholder '#' (Hash) tile and no optional icon.
import { describe, it, expect } from "vitest";
import * as fs from "fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("metric icons", () => {
  const grid = read("src/components/mobile/metric-grid.tsx");
  const card = read("src/components/ui/card.tsx");

  it("metric-grid.tsx has no Hash placeholder", () => {
    expect(grid).not.toMatch(/\bHash\b/);
  });

  it("Card.icon is an optional prop (MetricGrid takes Card's props)", () => {
    expect(card).toMatch(/^\s*icon\?: LucideIcon;/m);
    expect(grid).not.toMatch(/\?\?\s*Hash/);
  });

  it("casts that bypass the type check still carry icons (portfolio summary)", () => {
    const src = read("src/app/(app)/portfolio/_components/mobile-portfolio.tsx");
    const bad = src.split("\n").filter((l) => /\{\s*(icon:\s*\w+,\s*)?title: "/.test(l) && !/icon: \w+, title:/.test(l));
    expect(bad).toEqual([]);
  });
});

describe("no-history cards stay captioned, never invented", () => {
  it("goals / loans / budgets / dashboard budgets fall back to NO_HISTORY_CAPTION when no delta is derivable", () => {
    for (const p of ["goals/page", "loans/page", "categories/_page-content", "dashboard/page"]) {
      const src = read(`src/app/(app)/${p}.tsx`);
      expect(src, p).toContain("NO_HISTORY_CAPTION");
    }
    expect(read("src/lib/metrics/delta.ts")).toContain('NO_HISTORY_CAPTION = "No earlier history to compare"');
  });

  it("the dashboard uses the shared PageToolbar with no dashboard-specific range / month markup", () => {
    const src = read("src/app/(app)/dashboard/page.tsx");
    expect(src).toMatch(/<PageToolbar (refresh )?range=/);
    expect(src).not.toMatch(/data-slot="dashboard-range"/);
    expect(src).not.toMatch(/MetricRangeSelect|MonthSwitcher/);
  });
});
