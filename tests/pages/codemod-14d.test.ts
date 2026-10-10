// G2-14d: static guard for the viewport codemod in the reports, categories, tax, fire,
// scenarios, chat, api-docs, feedback, whats-new, transactions search/audit/new folders and
// their components. Every breakpoint token must be a regular:/wide:/max-regular: token.
// Scanner helpers are shared with tests/design-system-guard.test.ts (same regexes).
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import {
  BANNED_PATTERN,
  BREAKPOINT_PATTERN,
  SIZE_CLASS_WRAPPER_PATTERN,
  SOURCE_EXTS,
  countMatches,
  listSourceFiles,
  scanPaths,
  type Counts,
} from "../helpers/adaptive-scan";

const ROOT = process.cwd();

// Folders owned by G2-14d.
const SCOPE_DIRS = [
  "src/app/(app)/categories",
  "src/app/(app)/reports",
  "src/app/(app)/tax",
  "src/app/(app)/fire",
  "src/app/(app)/scenarios",
  "src/app/(app)/chat",
  "src/app/(app)/api-docs",
  "src/app/(app)/feedback",
  "src/app/(app)/whats-new",
  "src/app/(app)/transactions/search",
  "src/app/(app)/transactions/audit",
  "src/app/(app)/transactions/new",
  "src/components/reports",
  "src/components/transactions",
  "src/components/feedback",
];

// Single files owned by G2-14d.
const SCOPE_FILES = [
  "src/components/net-worth-history-chart.tsx",
  "src/components/reporting-recompute-indicator.tsx",
  "src/components/announcement-banner.tsx",
  "src/components/analytics-consent.tsx",
];

// Files under a scope dir that another package owns. Not scanned here.
const NOT_OURS: Record<string, string> = {
  "src/components/transactions/mobile-tx-list.tsx": "G2-09 (mobile transaction list) owns it",
};

// Documented exceptions: file -> expected hits plus reason. Empty: every scoped token was converted.
const EXCEPTIONS: Record<string, { count: number; reason: string }> = {};

function inScope(file: string): boolean {
  return SCOPE_DIRS.some((d) => file.startsWith(d + "/")) || SCOPE_FILES.includes(file);
}

function scopedFiles(): string[] {
  const dirFiles = listSourceFiles(ROOT, SCOPE_DIRS, SOURCE_EXTS);
  const all = [...dirFiles, ...SCOPE_FILES];
  return all.filter((f) => inScope(f) && !(f in NOT_OURS)).sort();
}

function scanScope(pattern: RegExp): Counts {
  return scanPaths(ROOT, scopedFiles(), pattern, []);
}

describe("G2-14d codemod: scope is real", () => {
  it("every scoped folder and file exists", () => {
    const missing = [...SCOPE_DIRS, ...SCOPE_FILES].filter((p) => !fs.existsSync(`${ROOT}/${p}`));
    expect(missing).toEqual([]);
  });

  it("scan covers files (non-empty) and every exception has a reason and a real file", () => {
    expect(scopedFiles().length).toBeGreaterThan(20);
    for (const [file, ex] of Object.entries(EXCEPTIONS)) {
      expect(fs.existsSync(`${ROOT}/${file}`), file).toBe(true);
      expect(ex.reason.trim().length, file).toBeGreaterThan(0);
    }
  });

  it("the variants the codemod writes exist in globals.css", () => {
    const css = fs.readFileSync(`${ROOT}/src/app/globals.css`, "utf-8");
    expect(css).toMatch(/@custom-variant regular \(@media \(width >= 40rem\)\);/);
    expect(css).toMatch(/@custom-variant max-regular \(@media \(width < 40rem\)\);/);
    expect(css).toMatch(/@custom-variant wide \(@media \(width > 64rem\)\);/);
  });
});

describe("G2-14d codemod: no viewport breakpoint tokens in scope", () => {
  it("no sm:/md:/lg:/xl:/2xl:/max-md:/max-sm: token outside the listed exceptions", () => {
    const hits = scanScope(BREAKPOINT_PATTERN);
    const offenders = Object.entries(hits).filter(([file, n]) => EXCEPTIONS[file]?.count !== n);
    expect(offenders, `breakpoint tokens left in scope: ${JSON.stringify(offenders)}`).toEqual([]);
  });
});

describe("G2-14d codemod: no banned adaptive patterns in scope", () => {
  it("no md:hidden, hidden md:, hidden max-md:, isMobile, window.innerWidth, matchMedia, useMediaQuery", () => {
    expect(scanScope(BANNED_PATTERN)).toEqual({});
  });
});

describe("G2-14d codemod: no size-class wrappers in scope", () => {
  it("no <CompactOnly> or <FromMd> outside the listed exceptions", () => {
    const hits = scanScope(SIZE_CLASS_WRAPPER_PATTERN);
    const offenders = Object.entries(hits).filter(([file, n]) => EXCEPTIONS[file]?.count !== n);
    expect(offenders).toEqual([]);
  });
});

describe("G2-14d codemod: scanner self-check", () => {
  it("the breakpoint pattern used here flags the tokens the codemod removed", () => {
    expect(countMatches("regular:grid-cols-3 max-regular:p-3 wide:col-span-1", BREAKPOINT_PATTERN)).toBe(0);
    expect(countMatches("md:flex", BREAKPOINT_PATTERN)).toBe(1);
  });
});
