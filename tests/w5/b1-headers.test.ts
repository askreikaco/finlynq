import { describe, it, expect } from "vitest";
import * as fs from "fs";

// W5-5: admin page headers normalised to the shared header target.
const FILES = [
  "src/app/(app)/admin/feedback/page.tsx",
  "src/app/(app)/admin/announcements/page.tsx",
  "src/app/(app)/admin/instance/page.tsx",
  "src/app/(app)/admin/(env)/integrations/page.tsx",
];

const TITLE_TARGET_RE = /^text-2xl font-bold tracking-tight( truncate| flex items-center gap-2)?$/;
const SUBTITLE_TARGET = "text-sm text-muted-foreground mt-0.5";
const OLD_STRINGS = [
  "text-2xl font-semibold tracking-tight",
  "text-2xl font-bold text-foreground",
  "text-3xl font-bold mb-2",
];

function extract(content: string, prop: string): string[] {
  const re = new RegExp(`${prop}="([^"]*)"`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
}

describe("W5-5 admin page headers", () => {
  for (const file of FILES) {
    describe(file, () => {
      const content = fs.readFileSync(file, "utf-8");

      it("has at least one titleClassName", () => {
        expect(extract(content, "titleClassName").length).toBeGreaterThan(0);
      });

      it("every titleClassName matches the header target", () => {
        for (const value of extract(content, "titleClassName")) {
          expect(value, `titleClassName="${value}"`).toMatch(TITLE_TARGET_RE);
        }
      });

      it("every subtitleClassName equals the header target where present", () => {
        for (const value of extract(content, "subtitleClassName")) {
          expect(value).toBe(SUBTITLE_TARGET);
        }
      });

      it("contains none of the old header strings", () => {
        for (const old of OLD_STRINGS) {
          expect(content.includes(old), old).toBe(false);
        }
      });
    });
  }
});
