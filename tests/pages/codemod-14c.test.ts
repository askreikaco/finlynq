// G2-14c: static guard for the admin, settings and account folders.
// These folders carry no viewport breakpoint token (sm/md/lg/xl/2xl, max-*),
// no banned adaptive pattern and no CompactOnly/FromMd wrapper, except the
// explicit EXCEPTIONS below. Breakpoint rules are in globals.css: regular: (>= 40rem),
// max-regular: (< 40rem), wide: (> 64rem), pointer-coarse:.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  BANNED_PATTERN,
  BREAKPOINT_PATTERN,
  SIZE_CLASS_WRAPPER_PATTERN,
  SOURCE_EXTS,
  countMatches,
  listSourceFiles,
} from "./../helpers/adaptive-scan";

const ROOT = process.cwd();
const FOLDERS = [
  "src/app/(app)/admin",
  "src/app/(app)/settings",
  "src/app/(app)/account",
  "src/components/admin",
  "src/components/settings",
] as const;

// "file:line" -> reason. Empty: every breakpoint, banned and wrapper hit in these folders was codemodded.
const EXCEPTIONS: Record<string, string> = {};

const FILES = listSourceFiles(ROOT, FOLDERS, SOURCE_EXTS);

// Hits as "file:line: text" for one pattern, across every file in the folders.
function hits(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const f of FILES) {
    const lines = fs.readFileSync(path.join(ROOT, f), "utf-8").split("\n");
    lines.forEach((line, i) => {
      if (countMatches(line, pattern) > 0) out.push(`${f}:${i + 1}`);
    });
  }
  return out;
}

describe("codemod-14c: admin, settings and account folders", () => {
  it("scans a non-empty set of source files, including the settings general page", () => {
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES).toContain("src/app/(app)/settings/general/page.tsx");
  });

  it("has no viewport breakpoint token outside the explicit exceptions", () => {
    const offenders = hits(BREAKPOINT_PATTERN).filter((h) => !(h in EXCEPTIONS));
    expect(offenders, `breakpoint tokens (use regular:/wide:/max-regular:/pointer-coarse:): ${offenders.join(", ")}`).toEqual([]);
  });

  it("has no banned adaptive pattern (md:hidden, hidden md:, isMobile, window.innerWidth, matchMedia, useMediaQuery)", () => {
    const offenders = hits(BANNED_PATTERN).filter((h) => !(h in EXCEPTIONS));
    expect(offenders, `banned patterns: ${offenders.join(", ")}`).toEqual([]);
  });

  it("has no CompactOnly or FromMd size-class wrapper outside the exceptions", () => {
    const offenders = hits(SIZE_CLASS_WRAPPER_PATTERN).filter((h) => !(h in EXCEPTIONS));
    expect(offenders, `size-class wrappers: ${offenders.join(", ")}`).toEqual([]);
  });

  it("every exception has a reason and still matches (no stale entries)", () => {
    const live = new Set([
      ...hits(BREAKPOINT_PATTERN),
      ...hits(BANNED_PATTERN),
      ...hits(SIZE_CLASS_WRAPPER_PATTERN),
    ]);
    for (const [loc, reason] of Object.entries(EXCEPTIONS)) {
      expect(reason.trim().length, `exception ${loc} needs a reason`).toBeGreaterThan(0);
      expect(live.has(loc), `exception ${loc} is stale`).toBe(true);
    }
  });

  it("admin env tab bar marker is a plain regular:hidden element, not a wrapper", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/app/(app)/admin/(env)/layout.tsx"), "utf-8");
    expect(src).not.toContain("CompactOnly");
    expect(src).toContain('<div className="regular:hidden absolute left-0 top-1/2');
  });
});
