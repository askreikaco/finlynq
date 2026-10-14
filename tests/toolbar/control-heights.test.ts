import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Owner 2026-10-14: the month switcher was taller than the range dropdown and the Spending/Income toggle. Every
// toolbar control is 44px (h-11). The Select base sets its height through data-[size=default]:h-8, which beats a
// plain h-11, so the toolbar height must be set on the same data-[size] selectors.
describe("toolbar controls share one height", () => {
  it("range dropdown trigger overrides the Select data-[size] height", () => {
    const src = read("src/components/metric-range-select.tsx");
    expect(src).toContain("data-[size=default]:h-11");
    expect(src).toContain("dense:pointer-fine:data-[size=default]:h-11");
  });
  it("segmented tabs (Spending/Income) are 44px, including dense pointer-fine", () => {
    const src = read("src/components/ui/tabs.tsx");
    expect(src).toMatch(/segmented: `rounded-full group-data-horizontal\/tabs:h-11 dense:pointer-fine:group-data-horizontal\/tabs:h-11/);
  });
  it("month switcher, search input and round buttons are 44px", () => {
    const tb = read("src/components/page-toolbar.tsx");
    expect(tb).toContain('data-slot="month-switcher" className={cn("flex h-11');
    expect(tb).toContain('"h-11 rounded-full pl-10 pr-10 text-sm"');
    expect(read("src/components/ui/round-icon-button.tsx")).toContain('"size-11 pointer-coarse:size-11 dense:pointer-fine:size-11 rounded-full p-0"');
  });
});
