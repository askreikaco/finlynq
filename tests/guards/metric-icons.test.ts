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
