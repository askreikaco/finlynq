// G2-14b: static guard for the family codemod. Pure file scan, no DOM, no build.
// Scope: src/app/(app)/family/** and src/components/family/** (no family-named files exist
// under src/components outside that folder).
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  BANNED_PATTERN,
  BREAKPOINT_PATTERN,
  SIZE_CLASS_WRAPPER_PATTERN,
  SOURCE_EXTS,
  listSourceFiles,
  scanPaths,
  type Counts,
} from "../helpers/adaptive-scan";

const ROOT = process.cwd();
const FOLDERS = ["src/app/(app)/family", "src/components/family"] as const;

// Explicit exceptions: file -> expected count, with the reason. Empty: G2-14b leaves none.
const BREAKPOINT_EXCEPTIONS: Counts = {};
const BANNED_EXCEPTIONS: Counts = {};
const WRAPPER_EXCEPTIONS: Counts = {};

const TEXT_PX = /(?<![\w-])text-\[\d+px\]/g;

const files = listSourceFiles(ROOT, FOLDERS, SOURCE_EXTS);
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

describe("codemod-14b: family folders", () => {
  it("scans the family source files (non-vacuous)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no viewport breakpoint tokens (sm/md/lg/xl/2xl, max-*) beyond listed exceptions", () => {
    expect(scanPaths(ROOT, files, BREAKPOINT_PATTERN)).toEqual(BREAKPOINT_EXCEPTIONS);
  });

  it("no banned adaptive patterns (md:hidden, hidden md:, isMobile, matchMedia, ...) beyond listed exceptions", () => {
    expect(scanPaths(ROOT, files, BANNED_PATTERN)).toEqual(BANNED_EXCEPTIONS);
  });

  it("no CompactOnly / FromMd size-class wrapper beyond listed exceptions", () => {
    expect(scanPaths(ROOT, files, SIZE_CLASS_WRAPPER_PATTERN)).toEqual(WRAPPER_EXCEPTIONS);
  });

  it("no text-[Npx] arbitrary font sizes", () => {
    const hits: Counts = {};
    for (const f of files) {
      const n = (read(f).match(TEXT_PX) || []).length;
      if (n > 0) hits[f] = n;
    }
    expect(hits).toEqual({});
  });

  it("mapped classes are in place (regular / wide / max-regular / pointer-coarse)", () => {
    const dialog = read("src/app/(app)/family/_components/invite-dialog.tsx");
    expect(dialog).toContain('className="regular:max-w-md"');

    const cards = read("src/app/(app)/family/_components/overview-cards.tsx");
    expect(cards).toContain("regular:grid-cols-2 wide:grid-cols-4");

    const overview = read("src/app/(app)/family/_components/overview-tab.tsx");
    expect(overview).toContain("max-regular:top-[calc(var(--sat)+var(--phone-header-h))] regular:static");
    expect(overview).toContain("pointer-coarse:w-11 pointer-coarse:h-11");
    expect(overview).toContain("wide:grid-cols-2");
  });
});
