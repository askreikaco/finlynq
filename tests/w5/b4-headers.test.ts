import { describe, it, expect } from "vitest";
import * as fs from "fs";

// W5-8: page headers normalised to the shared PageHeader target.
const FILES = [
  "src/app/(app)/family/share/page.tsx",
  "src/app/(app)/family/page.tsx",
  "src/app/(app)/family/accept/page.tsx",
  "src/app/(app)/import/page.tsx",
];

const TITLE_RE = /^text-2xl font-bold tracking-tight( truncate| flex items-center gap-2)?$/;
const SUBTITLE_TARGET = "text-sm text-muted-foreground mt-0.5";
const OLD_TITLES = ["text-2xl sm:text-3xl font-bold", "text-2xl font-semibold"];
const OLD_SUBTITLES = ["text-sm text-muted-foreground mt-1", "text-sm text-muted-foreground"];

function values(content: string, prop: "titleClassName" | "subtitleClassName"): string[] {
  const re = new RegExp(`\\b${prop}="([^"]*)"`, "g");
  return [...content.matchAll(re)].map((m) => m[1]);
}

describe("W5-8 page header classes", () => {
  for (const file of FILES) {
    it(`${file} uses the normalised header classes`, () => {
      const content = fs.readFileSync(file, "utf-8");

      for (const title of values(content, "titleClassName")) {
        expect(title, `titleClassName in ${file}`).toMatch(TITLE_RE);
      }
      for (const subtitle of values(content, "subtitleClassName")) {
        expect(subtitle, `subtitleClassName in ${file}`).toBe(SUBTITLE_TARGET);
      }
      for (const old of OLD_TITLES) {
        expect(values(content, "titleClassName"), `old title "${old}" in ${file}`).not.toContain(old);
      }
      for (const old of OLD_SUBTITLES) {
        if (old === SUBTITLE_TARGET) continue;
        expect(values(content, "subtitleClassName"), `old subtitle "${old}" in ${file}`).not.toContain(old);
      }
    });
  }
});
