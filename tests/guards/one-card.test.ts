// One card: src/components/ui/card.tsx `Card` is the ONLY card (metric tile, titled section, plain box, divided list).
// MetricCard, SectionCard, the shadcn Card parts, NetWorthHero, StatTile & co are gone; MetricGrid is only a layout wrapper.
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
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
/** Code only: comments may still mention old names in prose. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const file = (rel: string) => FILES.find((f) => f.rel === rel)!;
const grep = (cmd: string) =>
  execSync(`${cmd} || true`, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

describe("one card", () => {
  it("every old card component and its parts are gone from src", () => {
    const hits = FILES.filter((f) =>
      stripComments(f.src).match(/\b(StatTile|MetricTextItem|StatCard|MetricItem|MetricItemCard|MetricCard|MetricCardProps|MetricCardSkeleton|SectionCard|SectionCardProps|NetWorthHero|CardHeader|CardTitle|CardDescription|CardContent|CardFooter|CardAction|PctBadge|InsetGroup|InsetSectionHeader)\b/),
    ).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("the old component files are deleted", () => {
    for (const f of [
      "src/components/metric-card.tsx",
      "src/components/mobile/section-card.tsx",
      "src/components/mobile/net-worth-hero.tsx",
      "src/components/mobile/stat-tile.tsx",
      "src/components/mobile/chart-metric-grid.tsx",
      "src/components/mobile/inset-group.tsx",
      "src/app/(app)/dashboard/_components/stat-card.tsx",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), f)), f).toBe(false);
    }
  });

  it("ui/card.tsx exports one component, `Card` (CardLabel stays internal to the mobile folder)", () => {
    const card = file("src/components/ui/card.tsx");
    const exported = [...card.src.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]);
    expect(exported).toEqual(["Card"]);
    expect(FILES.filter((f) => /\bCardLabel\b/.test(f.src) && f.rel !== "src/components/mobile/card-label.tsx" && f.rel !== "src/components/ui/card.tsx" && f.rel !== "src/components/ui/field/field.tsx").map((f) => f.rel)).toEqual([]);
    const barrel = file("src/components/mobile/index.ts");
    expect(barrel.src).not.toMatch(/\bCardLabel\b/);
  });

  it("Card exposes every part as an optional prop", () => {
    const { src } = file("src/components/ui/card.tsx");
    for (const prop of [
      "title", "titlePlacement", "titleClassName", "icon", "tone", "info", "infoLabel", "description", "descriptionPlacement", "action",
      "frame", "padded", "frameClassName", "className", "href",
      "value", "currency", "valueTone", "showSign", "valueClassName", "size", "delta", "sub", "note", "progress", "spark", "loading",
    ]) {
      expect(src, prop).toMatch(new RegExp(`\\b${prop}\\?:`));
    }
    expect(src).toContain('from "@/components/ui/info-tip"');
    expect(src).toMatch(/frame\?: "card" \| "bare" \| "list"/);
    expect(src).toMatch(/delta\?: CardDelta/);
    expect(src).toMatch(/progress\?: CardProgress/);
    expect(src).not.toMatch(/\b(badgePct|invertTone|iconTone|sparkData|sparkColor|cellClassName|cardClassName|labelPlacement)\b/);
  });

  it("`badgePct` survives only as DATA (a ResolvedCard / trend shape a page maps into `delta`), never as a card prop", () => {
    const declares = FILES.filter((f) => /\bbadgePct\??\s*:\s*(number|null)/.test(f.src)).map((f) => f.rel).sort();
    expect(declares).toEqual(["src/app/(app)/dashboard/_components/key-metrics.tsx", "src/lib/metrics/delta.ts"]);
  });

  it("no hand-rolled progress bar inside a metric card (use the `progress` part)", () => {
    const avail = file("src/app/(app)/dashboard/_components/available-to-spend.tsx");
    expect(avail.src).toContain("progress={");
    expect(avail.src).not.toMatch(/bg-muted\/50 rounded-full/);
  });

  it("MetricGrid renders Cards from Card's own props (no other tile markup)", () => {
    const grid = file("src/components/mobile/metric-grid.tsx");
    expect(grid.src).toMatch(/metrics: CardProps\[\]/);
    expect(grid.src).toMatch(/<Card\b/);
  });

  it("no page hand-rolls a divided list on a Card (use frame=\"list\")", () => {
    expect(grep("grep -rnE '<Card[^>]*list-divider' src --include=*.tsx")).toEqual([]);
  });

  it("no hand-rolled KPI block in an app page (text-2xl font-bold values outside Card)", () => {
    const hits = FILES.filter((f) => f.rel.startsWith("src/app/(app)/") && /text-2xl font-(bold|semibold)[^"`]*(tabular-nums|hero-number)/.test(f.src)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });
});
