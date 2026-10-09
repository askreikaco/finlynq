/**
 * G2-14a: static guard for the import, reconcile and staging folders.
 * After the codemod these folders use only the size-class variants
 * (regular:, wide:, max-regular:) and base classes. No viewport breakpoint
 * token, no banned adaptive pattern, no CompactOnly/FromMd wrapper.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
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
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

// G2-14a folders (edit only these in this package).
const FOLDERS = [
  "src/app/(app)/import",
  "src/components/import",
  "src/components/reconcile",
  "src/components/staging",
] as const;

// Explicit exceptions: file -> hits allowed + reason. Empty: none in these folders.
const EXCEPTIONS: Record<string, { hits: number; reason: string }> = {};

const files = () => listSourceFiles(ROOT, FOLDERS, SOURCE_EXTS);

describe("codemod-14a: import, reconcile and staging folders", () => {
  it("scans a non-empty set of files", () => {
    expect(files().length).toBeGreaterThan(20);
  });

  it("no viewport breakpoint token (sm:/md:/lg:/xl:/2xl:, max-*) outside the listed exceptions", () => {
    const hits: Counts = scanPaths(ROOT, files(), BREAKPOINT_PATTERN);
    const expected: Counts = Object.fromEntries(
      Object.entries(EXCEPTIONS).map(([f, e]) => [f, e.hits])
    );
    expect(hits).toEqual(expected);
  });

  it("no banned adaptive pattern (md:hidden, hidden md:, isMobile, matchMedia, ...)", () => {
    expect(scanPaths(ROOT, files(), BANNED_PATTERN)).toEqual({});
  });

  it("no CompactOnly / FromMd size-class wrapper", () => {
    expect(scanPaths(ROOT, files(), SIZE_CLASS_WRAPPER_PATTERN)).toEqual({});
  });

  it("no breakpoint key left in the breakpoint baseline for these folders", () => {
    const baseline: Counts = JSON.parse(read("tests/fixtures/breakpoint-baseline.json"));
    const mine = Object.keys(baseline).filter((f) => FOLDERS.some((d) => f.startsWith(d + "/")));
    expect(mine).toEqual(Object.keys(EXCEPTIONS).filter((f) => FOLDERS.some((d) => f.startsWith(d + "/"))));
  });

  it("spot checks: mapped classes are in place (sm->regular, md->regular, lg->wide)", () => {
    expect(read("src/components/import/reconcile/two-pane-layout.tsx")).toContain("wide:grid-cols-[2fr_3fr]");
    expect(read("src/components/import/reconcile/two-pane-layout.tsx")).toContain("wide:grid-cols-2");
    expect(read("src/app/(app)/import/components/connector-mapping-dialog.tsx")).toContain("grid-cols-1 regular:grid-cols-2");
    expect(read("src/components/reconcile/bulk-link-action-bar.tsx")).toContain("regular:bottom-4");
    expect(read("src/components/staging/reconciliation-callout.tsx")).toContain('"regular:grid-cols-3" : "regular:grid-cols-2"');
    expect(read("src/app/(app)/import/components/import-preview-dialog.tsx")).toContain('"regular:justify-between"');
  });

  it("the phone (base) classes on the spot-checked lines are unchanged", () => {
    expect(read("src/components/reconcile/balance-summary-card.tsx")).toContain("grid grid-cols-1 regular:grid-cols-3 gap-4");
    expect(read("src/components/import/staged-review-surface.tsx")).toContain("flex flex-col gap-4 regular:h-[calc(100dvh-8rem)]");
  });

  it("countMatches sanity: the breakpoint pattern would catch a reintroduced token", () => {
    expect(countMatches("grid md:grid-cols-2", BREAKPOINT_PATTERN)).toBe(1);
  });
});
