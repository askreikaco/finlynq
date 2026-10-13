import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// W5-6: page headers must share one title/subtitle treatment.
const ROOT = process.cwd();
// fire/page.tsx moved onto SectionPage (the template owns the header title class), so it is not checked here.
// whats-new and feedback moved onto SectionPage in batch 5: the template owns the title, so they pass no override.
const SECTION_PAGE_FILES = ["src/app/(app)/whats-new/page.tsx", "src/app/(app)/feedback/page.tsx"];
const FILES = [...SECTION_PAGE_FILES, "src/app/(app)/categories/[id]/page.tsx"];

const TITLE_TARGET_RE = /^text-2xl font-bold tracking-tight( truncate| flex items-center gap-2)?$/;
const SUBTITLE_TARGET = "text-sm text-muted-foreground mt-0.5";
const OLD_STRINGS = [
  "text-2xl font-semibold tracking-tight",
  "text-2xl font-bold truncate",
  "text-2xl font-bold flex items-center gap-2",
  'subtitleClassName="mt-1 text-sm text-muted-foreground"',
];

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function values(src: string, attr: string): string[] {
  const re = new RegExp(`(?<![A-Za-z])${attr}="([^"]*)"`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

describe("W5-6 page headers", () => {
  for (const rel of FILES) {
    describe(rel, () => {
      const src = read(rel);

      it("every titleClassName matches the header target", () => {
        const titles = values(src, "titleClassName");
        if (SECTION_PAGE_FILES.includes(rel)) {
          expect(src).toMatch(/<SectionPage\b/);
          expect(titles).toEqual([]);
          return;
        }
        expect(titles.length).toBeGreaterThan(0);
        for (const v of titles) {
          expect(v).toMatch(TITLE_TARGET_RE);
        }
      });

      it("every subtitleClassName equals the header target where present", () => {
        for (const v of values(src, "subtitleClassName")) {
          expect(v).toBe(SUBTITLE_TARGET);
        }
      });

      it("old header strings are absent", () => {
        for (const old of OLD_STRINGS) {
          expect(src.includes(old), `found legacy "${old}"`).toBe(false);
        }
      });
    });
  }
});
