// One metric card: src/components/metric-card.tsx (the Net Worth design) is the ONLY metric / KPI card. StatTile,
// MetricTextItem and the dashboard StatCard are gone; MetricGrid is only the layout wrapper that renders MetricCards.
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

describe("one metric card", () => {
  it("no file under src imports or defines StatTile / MetricTextItem / StatCard", () => {
    const hits = FILES.filter((f) => /\b(StatTile|MetricTextItem|StatCard)\b/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("the old component files are deleted", () => {
    for (const f of [
      "src/components/mobile/stat-tile.tsx",
      "src/components/mobile/chart-metric-grid.tsx",
      "src/app/(app)/dashboard/_components/stat-card.tsx",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), f)), f).toBe(false);
    }
  });

  it("MetricItem / MetricItemCard are gone: MetricGrid takes MetricCard's own props", () => {
    const hits = FILES.filter((f) => /\b(MetricItem|MetricItemCard)\b/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
    const grid = FILES.find((f) => f.rel === "src/components/mobile/metric-grid.tsx")!;
    expect(grid.src).toMatch(/metrics: MetricCardProps\[\]/);
  });

  it("MetricCard owns the delta / progress / info parts (badgePct, invertTone, iconTone props are gone)", () => {
    const card = FILES.find((f) => f.rel === "src/components/metric-card.tsx")!;
    expect(card.src).toMatch(/export function MetricCard\(/);
    expect(card.src).toMatch(/delta\?: MetricDelta/);
    expect(card.src).toMatch(/progress\?: MetricProgress/);
    expect(card.src).toMatch(/info\?: ReactNode/);
    expect(card.src).not.toMatch(/\b(badgePct|invertTone|iconTone)\b/);
    // `badgePct` survives only as DATA (a ResolvedCard / trend shape a page maps into `delta`), never as a card prop.
    const declares = FILES.filter((f) => /\bbadgePct\??\s*:\s*(number|null)/.test(f.src)).map((f) => f.rel).sort();
    expect(declares).toEqual(["src/app/(app)/dashboard/_components/key-metrics.tsx", "src/lib/metrics/delta.ts"]);
  });

  it("no hand-rolled progress bar inside a metric card (use the `progress` part)", () => {
    const avail = FILES.find((f) => f.rel === "src/app/(app)/dashboard/_components/available-to-spend.tsx")!;
    expect(avail.src).toContain("progress={");
    expect(avail.src).not.toMatch(/bg-muted\/50 rounded-full/);
  });

  it("MetricGrid renders MetricCards (no other tile markup)", () => {
    const grid = FILES.find((f) => f.rel === "src/components/mobile/metric-grid.tsx")!;
    expect(grid.src).toMatch(/<MetricCard\b/);
    expect(grid.src).not.toMatch(/from "\.\/stat-tile"/);
  });

  it("no hand-rolled KPI block in an app page (text-2xl font-bold values outside MetricCard)", () => {
    const hits = FILES.filter((f) => f.rel.startsWith("src/app/(app)/") && /text-2xl font-(bold|semibold)[^"`]*(tabular-nums|hero-number)/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });
});
