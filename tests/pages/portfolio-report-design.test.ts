// @vitest-environment node
// Static guard for the portfolio report pages (realized gains, dividend income) and their shared
// controls: PageHeader page, ListRow below md, a FromMd-wrapped table with a sticky header in its own
// scroll box, system text sizes only, palette tokens only, dvh not vh, and no adaptive literals.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const REALIZED = "src/app/(app)/portfolio/realized-gains/page.tsx";
const DIVIDENDS = "src/app/(app)/portfolio/dividends/page.tsx";
const CONTROLS = "src/app/(app)/portfolio/_components/report-controls.tsx";
const PAGES = [REALIZED, DIVIDENDS];
const ALL = [REALIZED, DIVIDENDS, CONTROLS];

const PALETTE = /\b(bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|decoration|accent|caret|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b/;

/** Every `<Table` opening must sit inside a `<FromMd>` wrapper (md+ only), never bare below md. */
function tablesInsideFromMd(src: string): boolean {
  for (const m of src.matchAll(/<Table\b/g)) {
    const before = src.slice(0, m.index!);
    if (before.lastIndexOf("<FromMd") <= before.lastIndexOf("</FromMd>")) return false;
  }
  return true;
}

describe("portfolio report pages: PageHeader page below and above md", () => {
  it.each(PAGES)("%s uses the shared PageHeader with a back link to /portfolio", (f) => {
    const src = read(f);
    expect(src).toMatch(/<PageHeader\b/);
    expect(src).toMatch(/backHref="\/portfolio"/);
    expect(src).toMatch(/from "@\/components\/mobile"/);
  });

  it.each(PAGES)("%s renders the page root as a tall space-y container (sticky header parent)", (f) => {
    expect(read(f)).toMatch(/<div className="space-y-4 md:space-y-6">\s*<PageHeader/);
  });

  it.each(PAGES)("%s has no Dialog/Sheet import (the report is a page, not a popup)", (f) => {
    expect(read(f)).not.toMatch(/from "@\/components\/ui\/(dialog|sheet)"/);
  });
});

describe("below md: ListRow lists; md+: table only inside FromMd", () => {
  it.each(PAGES)("%s uses ListRow for the phone list and CompactOnly for the phone-only block", (f) => {
    const src = read(f);
    expect(src).toMatch(/<ListRow\b/);
    expect(src).toMatch(/<CompactOnly/);
  });

  it.each(PAGES)("%s: no raw table below md (every <Table is inside a FromMd wrapper)", (f) => {
    const src = read(f);
    expect(src).toMatch(/<FromMd/);
    expect(tablesInsideFromMd(src)).toBe(true);
  });

  it.each(PAGES)("%s: md+ table header is sticky inside its own max-height scroll container", (f) => {
    const src = read(f);
    expect(src).toMatch(/<TableHeader className="sticky top-0 z-10 bg-card">/);
    expect(src).toMatch(/containerClassName="max-h-\[70dvh\] overflow-y-auto/);
  });
});

describe("system type scale, palette tokens, units, adaptive helpers", () => {
  it.each(ALL)("%s has no arbitrary text-[Npx] / text-[Nrem] sizes", (f) => {
    expect(read(f)).not.toMatch(/text-\[\d+(\.\d+)?(px|rem)\]/);
  });

  it.each(ALL)("%s uses palette tokens only (no hardcoded Tailwind palette colours, no hex)", (f) => {
    const src = read(f);
    expect(src.match(new RegExp(PALETTE.source, "g")) ?? []).toEqual([]);
    expect(src).not.toMatch(/className="[^"]*#[0-9a-fA-F]{3,6}/);
  });

  it.each(ALL)("%s uses dvh, never vh", (f) => {
    expect(read(f)).not.toMatch(/(?<![\w-])\d+(\.\d+)?vh\b/);
  });

  it.each(ALL)("%s has no adaptive literal (md:hidden / hidden md: / isMobile / window.innerWidth)", (f) => {
    expect(read(f)).not.toMatch(/md:hidden|hidden\s+md:|isMobile|window\.innerWidth/);
  });

  it("filter sheet is a bottom sheet with overscroll-contain and dvh max height", () => {
    const src = read(CONTROLS);
    expect(src).toMatch(/side="bottom"/);
    expect(src).toContain("overscroll-contain");
    expect(src).toContain("max-h-[85dvh]");
  });

  it("filter chips use Button size sm (44pt below md via the Button touch sizes)", () => {
    expect(read(CONTROLS)).toMatch(/size="sm"/);
  });
});

describe("mutation anchors (the three assertions the mutation check breaks)", () => {
  it("the realized page keeps its md+ table wrapped in FromMd", () => {
    expect(tablesInsideFromMd(read(REALIZED))).toBe(true);
  });

  it("the dividends page has no arbitrary text size", () => {
    expect(read(DIVIDENDS)).not.toMatch(/text-\[\d+(\.\d+)?(px|rem)\]/);
  });

  it("the realized page table container uses dvh", () => {
    expect(read(REALIZED)).toMatch(/max-h-\[70dvh\]/);
  });
});
