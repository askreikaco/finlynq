/**
 * Static wiring for the pages that have Customize cards and the shared metric grid rule. Reads source (no
 * render): each page registers its cards through the generic hook and the shared registry, and its metric
 * grids use METRIC_GRID_CLASS / metricGridClass.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const APP = "src/app/(app)";

describe("pages with cards: generic Customize wiring", () => {
  it.each([
    ["accounts", `${APP}/accounts/page.tsx`],
    ["categories", `${APP}/categories/_page-content.tsx`],
    ["reports", `${APP}/reports/page.tsx`],
    ["portfolio", `${APP}/portfolio/page.tsx`],
    ["dashboard", `${APP}/dashboard/page.tsx`],
  ])("%s uses useCardLayout + usePageCustomize + CustomizeCardsSheet", (page, file) => {
    const src = read(file);
    expect(src).toContain(`useCardLayout("${page}"`);
    expect(src).toContain("usePageCustomize(");
    expect(src).toMatch(/<CustomizeCardsSheet|<CustomizeDashboardSheet/);
  });

  it("the dashboard keeps its legacy storage endpoint and no longer has the insights accordion", () => {
    const src = read(`${APP}/dashboard/page.tsx`);
    expect(src).toContain('endpoint: "/api/settings/dashboard-layout"');
    expect(src).not.toContain("Disclosure");
    expect(src).not.toMatch(/More insights|Fewer insights/);
    expect(src).not.toContain("extra: true");
    expect(src).not.toContain("SlidersHorizontal");
    expect(src).not.toContain("moreInsights");
    expect(src).not.toContain("useDashboardLayout");
  });

  it("the dashboard metric tiles use the shared metric grid", () => {
    const src = read(`${APP}/dashboard/page.tsx`);
    expect(src).toContain("METRIC_GRID_CLASS");
    expect(src).toContain("metricGridClass(");
    expect(src).not.toContain('"grid grid-cols-2 wide:grid-cols-3 gap-3 regular:gap-4"');
  });

  it("the header Customize action is registered by the page, not in the page's own actions", () => {
    const src = read(`${APP}/dashboard/page.tsx`);
    expect(src).not.toMatch(/label: "Customize"/);
    expect(src).not.toMatch(/>\s*Customize\s*</);
  });
});

describe("metric grids on the allowed pages use the shared rule", () => {
  it("accounts summary is a 2-tile metric grid", () => {
    expect(read(`${APP}/accounts/page.tsx`)).toContain("metricGridClass(2)");
  });

  it("reports summary is a 4-tile metric grid (2 mobile, 3 tablet, 4 desktop)", () => {
    const src = read(`${APP}/reports/page.tsx`);
    expect(src).toContain('metricGridClass(4, "gap-4")');
    expect(src).not.toContain("grid-cols-2 regular:grid-cols-4");
  });

  it("portfolio summary and benchmark tiles follow the item count", () => {
    expect(read(`${APP}/portfolio/_components/mobile-portfolio.tsx`)).toContain("metricGridClass(metrics.length)");
    expect(read(`${APP}/portfolio/_components/benchmark-chart.tsx`)).toContain("metricGridClass(benchmarks.length)");
    expect(read(`${APP}/portfolio/_components/mobile-portfolio.tsx`)).not.toContain("wide:grid-cols-6");
  });

  it("no allowed page keeps the old 2-up-to-4 or 6-col metric grids", () => {
    for (const f of [
      `${APP}/accounts/page.tsx`,
      `${APP}/reports/page.tsx`,
      `${APP}/portfolio/_components/mobile-portfolio.tsx`,
      `${APP}/portfolio/_components/portfolio-ui.tsx`,
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/grid-cols-2 wide:grid-cols-4 gap-4/);
      expect(src, f).not.toMatch(/wide:grid-cols-6/);
    }
  });
});
