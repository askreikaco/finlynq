// @vitest-environment node
// Static guard for the portfolio report pages (realized gains, dividend income) and their shared
// controls: PageHeader page, ListRow below md, a size-class-gated table with a sticky header in its own
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

describe("portfolio report pages: PageHeader page below and above md", () => {
  it.each(PAGES)("%s uses the shared PageHeader (via SectionPage) with a back link to /portfolio", (f) => {
    const src = read(f);
    expect(src).toMatch(/<SectionPage\b/);
    expect(src).toMatch(/back=\{\{ href: "\/portfolio"/);
    expect(src).toMatch(/from "@\/components\/templates\/section-page"/);
  });

  it.each(PAGES)("%s renders the page root as a tall space-y container (sticky header parent)", (f) => {
    expect(read(f)).toMatch(/<SectionPage\b[\s\S]*?\bstack="4"[\s\S]*?className="regular:space-y-6"/);
  });

  it.each(PAGES)("%s has no Dialog/Sheet import (the report is a page, not a popup)", (f) => {
    expect(read(f)).not.toMatch(/from "@\/components\/ui\/(dialog|sheet)"/);
  });
});

describe("one list at every width: ListRow rows, no table at any size class", () => {
  it.each(PAGES)("%s uses ListRow for the list at every size class (no size-class switch)", (f) => {
    const src = read(f);
    expect(src).toMatch(/<ListRow\b/);
    expect(src).not.toMatch(/!regular \? /);
    expect(src).not.toMatch(/<(CompactOnly|FromMd)\b/);
  });

  it.each(PAGES)("%s: no <Table at any width", (f) => {
    expect(read(f)).not.toMatch(/<Table\b/);
    expect(read(f)).not.toMatch(/from "@\/components\/ui\/table"/);
  });

  it.each(PAGES)("%s: the rows scroll with the page (no max-height table box)", (f) => {
    expect(read(f)).not.toMatch(/containerClassName="max-h-/);
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

  it("filter chips use Button size sm (44pt below md via the Button touch sizes)", () => {
    expect(read(CONTROLS)).toMatch(/size="sm"/);
  });
});

describe("mutation anchors (the three assertions the mutation check breaks)", () => {
  it("the realized page has no table: its list is ListRows at every width", () => {
    const src = read(REALIZED);
    expect(src).not.toMatch(/<Table\b/);
    expect(src).toMatch(/<ListRow\b/);
  });

  it("the dividends page has no arbitrary text size", () => {
    expect(read(DIVIDENDS)).not.toMatch(/text-\[\d+(\.\d+)?(px|rem)\]/);
  });

  it("the realized page keeps its dvh-free, table-free list", () => {
    expect(read(REALIZED)).not.toMatch(/max-h-\[70dvh\]/);
  });
});
