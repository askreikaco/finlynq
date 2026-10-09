import { describe, it, expect } from "vitest";
import * as fs from "fs";

// W5-21: page headers tail. Source-assertion tests (node env) over the three
// pages that still carried non-standard PageHeader classes.

const FILES = [
  "src/app/(app)/transactions/audit/page.tsx",
  "src/app/(app)/import/pending/_components/reconcile-header.tsx",
  "src/app/(app)/subscriptions/page.tsx",
];

const TITLE_TARGET = "text-2xl font-bold tracking-tight";
const TITLE_ALLOWED = /^text-2xl font-bold tracking-tight( truncate| flex items-center gap-2)?$/;
const SUBTITLE_TARGET = "text-sm text-muted-foreground mt-0.5";

// Match titleClassName / subtitleClassName attributes, not the substring inside subtitleClassName.
const TITLE_ATTR = /(?<![A-Za-z])titleClassName="([^"]*)"/g;
const SUBTITLE_ATTR = /subtitleClassName="([^"]*)"/g;

function read(file: string): string {
  return fs.readFileSync(file, "utf-8");
}

function values(src: string, re: RegExp): string[] {
  return [...src.matchAll(re)].map((m) => m[1]);
}

describe("W5-21 page headers tail", () => {
  for (const file of FILES) {
    describe(file, () => {
      const src = read(file);

      it("every titleClassName uses the standard header title class", () => {
        const titles = values(src, TITLE_ATTR);
        expect(titles.length).toBeGreaterThan(0);
        for (const t of titles) {
          expect(t).toMatch(TITLE_ALLOWED);
        }
      });

      it("every subtitleClassName equals the standard subtitle class where present", () => {
        for (const s of values(src, SUBTITLE_ATTR)) {
          expect(s).toBe(SUBTITLE_TARGET);
        }
      });

      it("old non-standard header classes are absent", () => {
        expect(src).not.toContain('titleClassName="text-xl font-semibold tracking-tight"');
        expect(src).not.toContain('titleClassName="text-2xl font-bold"');
        expect(src).not.toContain('subtitleClassName="text-sm text-muted-foreground mt-1"');
      });
    });
  }

  it("target constant is the one the header tests assert", () => {
    expect(TITLE_TARGET).toMatch(TITLE_ALLOWED);
  });
});
