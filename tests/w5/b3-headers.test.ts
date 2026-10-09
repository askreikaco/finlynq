// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// W5-7: page headers normalised to the shared PageHeader target classes.
const ROOT = join(__dirname, "..", "..");
const FILES = [
  "src/app/(app)/portfolio/new/page.tsx",
  "src/app/(app)/scenarios/page.tsx",
  "src/app/(app)/settings/backfill/[runId]/page.tsx",
  "src/app/(app)/settings/backfill/page.tsx",
];

const TITLE_RE = /^text-2xl font-bold tracking-tight( truncate| flex items-center gap-2)?$/;
const SUBTITLE_TARGET = "text-sm text-muted-foreground mt-0.5";
const OLD_TITLES = ["text-2xl font-semibold", "text-2xl font-bold"];
const OLD_SUBTITLES = ["text-sm text-muted-foreground", "text-sm text-muted-foreground mt-1"];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function values(src: string, prop: string): string[] {
  const re = new RegExp(`(?<![A-Za-z])${prop}="([^"]*)"`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

describe("W5-7 page headers", () => {
  for (const rel of FILES) {
    describe(rel, () => {
      const src = read(rel);

      it("every titleClassName matches the header target", () => {
        for (const v of values(src, "titleClassName")) {
          expect(v).toMatch(TITLE_RE);
        }
      });

      it("every subtitleClassName equals the header target", () => {
        for (const v of values(src, "subtitleClassName")) {
          expect(v).toBe(SUBTITLE_TARGET);
        }
      });

      it("old header class strings are absent", () => {
        for (const old of OLD_TITLES) {
          expect(src).not.toContain(`titleClassName="${old}"`);
        }
        for (const old of OLD_SUBTITLES) {
          expect(src).not.toContain(`subtitleClassName="${old}"`);
        }
      });
    });
  }
});
