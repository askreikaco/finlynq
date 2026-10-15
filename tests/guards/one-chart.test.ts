// One chart: src/components/chart/ (`<Chart kind=...>`) is the ONLY place that draws a chart. No other file imports
// recharts or hand-draws chart SVG; the old per-kind components are gone; nothing animates on mount.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC).map((f) => ({ rel: path.relative(process.cwd(), f).split(path.sep).join("/"), src: fs.readFileSync(f, "utf8") }));
const OUTSIDE = FILES.filter((f) => !f.rel.startsWith("src/components/chart/"));
// The marketing landing page draws its own decorative illustration; it is not a data chart.
const DATA_UI = OUTSIDE.filter((f) => !f.rel.startsWith("src/components/landing/"));

describe("one chart", () => {
  it("only src/components/chart/ imports recharts", () => {
    const hits = OUTSIDE.filter((f) => /from "recharts"/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("no file outside the chart hand-draws a chart (polyline / polygon)", () => {
    const hits = DATA_UI.filter((f) => /<(polyline|polygon)\b/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("the old chart components and their exports are deleted", () => {
    for (const f of [
      "src/components/sankey-chart.tsx",
      "src/components/csp-safe-bar.tsx",
      "src/components/chart-breakdown-list.tsx",
      "src/components/chart-stack-legend.tsx",
      "src/components/chart-stack-tooltip.tsx",
      "src/components/ui/progress.tsx",
      "src/app/(app)/dashboard/_components/chart-tooltip.tsx",
      "src/app/(app)/dashboard/_components/animated-number.tsx",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), f)), f).toBe(false);
    }
    const hits = FILES.filter((f) => /\b(CspSafeBar|CspSafeColorBar|ColorDot|SankeyChart|NetWorthAreaChart|PerformanceLineChart|TooltipBreakdownList|StackedChartLegend|StackedAreaTooltip|ProgressTrack|ProgressIndicator)\b/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("the only sparkline shim is the one metric-card.tsx and list-row.tsx still import", () => {
    const importers = FILES.filter((f) => /from "@\/components\/sparkline"/.test(f.src)).map((f) => f.rel).sort();
    expect(importers).toEqual(["src/components/metric-card.tsx", "src/components/mobile/list-row.tsx"]);
  });

  it("charts never animate on mount: no isAnimationActive other than false, no useAnimations in the chart", () => {
    for (const f of FILES.filter((x) => x.rel.startsWith("src/components/chart/"))) {
      expect(f.src, f.rel).not.toMatch(/isAnimationActive=\{(?!false\})/);
      expect(f.src, f.rel).not.toContain("useAnimations");
    }
  });

  it("no inline style attribute in the chart markup (CSP)", () => {
    for (const f of FILES.filter((x) => x.rel.startsWith("src/components/chart/"))) {
      expect(f.src, f.rel).not.toMatch(/\sstyle=\{\{/);
    }
  });

  it("chart colours come from the shared palette and tone tokens, not new hex lists", () => {
    const shared = fs.readFileSync(path.join(SRC, "components/chart/shared.tsx"), "utf8");
    expect(shared).toContain('from "@/lib/chart-colors"');
    expect(shared).toContain('from "@/lib/status-colour"');
  });
});
