import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import {
  BANNED_PATTERN,
  BANNED_DIRS,
  BANNED_EXEMPT,
  BREAKPOINT_PATTERN,
  BREAKPOINT_EXEMPT,
  SIZE_CLASS_WRAPPER_PATTERN,
  SOURCE_EXTS,
  countMatches,
  isExempt,
  listSourceFiles,
  ratchet,
  scanContents,
  scanPaths,
  type Counts,
  type RatchetReport,
} from "./helpers/adaptive-scan";

const ADAPTIVE_BASELINE_PATH = "tests/fixtures/adaptive-baseline.json";
const BREAKPOINT_BASELINE_PATH = "tests/fixtures/breakpoint-baseline.json";
const WRAPPER_BASELINE_PATH = "tests/fixtures/size-class-wrapper-baseline.json";
const ROOT = process.cwd();

function loadBaseline(path: string): Counts {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

// Offender message for a failing ratchet: lists every file with its counts.
function ratchetFailure(label: string, report: RatchetReport): string[] {
  const lines: string[] = [];
  if (report.newFiles.length) lines.push(`${label} new files (baseline must be 0 hits): ${report.newFiles.join(", ")}`);
  if (report.increased.length) lines.push(`${label} increased (may only go down): ${report.increased.join("; ")}`);
  if (report.decreased.length) lines.push(`${label} decreased, lower the baseline: ${report.decreased.join("; ")}`);
  if (report.stale.length) lines.push(`${label} stale baseline entries (0 hits, remove): ${report.stale.join(", ")}`);
  return lines;
}

function scanBanned(): Counts {
  return scanPaths(ROOT, listSourceFiles(ROOT, BANNED_DIRS, SOURCE_EXTS), BANNED_PATTERN, BANNED_EXEMPT);
}

function scanAll(pattern: RegExp, exempt: readonly string[]): Counts {
  return scanPaths(ROOT, listSourceFiles(ROOT, ["src"], SOURCE_EXTS), pattern, exempt);
}

describe("design-system-guard: ratchet for adaptive patterns", () => {
  let baseline: Counts;
  let current: Counts;

  beforeAll(() => {
    baseline = loadBaseline(ADAPTIVE_BASELINE_PATH);
    current = scanBanned();
  });

  it("should not have new files using banned adaptive patterns", () => {
    const newFiles = Object.keys(current).filter((file) => !baseline[file]);
    expect(
      newFiles,
      `Found new files with adaptive patterns: ${newFiles.join(", ")}`
    ).toEqual([]);
  });

  it("should not increase usage count in existing files", () => {
    const increased = ratchet(baseline, current).increased;
    expect(
      increased,
      `Found files with increased adaptive pattern usage: ${increased.join(", ")}`
    ).toEqual([]);
  });

  it("ratchet tightens: must update baseline when usage decreases", () => {
    const decreased = ratchet(baseline, current).decreased;
    expect(
      decreased,
      `Found files with decreased usage but stale baseline: ${decreased.join(", ")}`
    ).toEqual([]);
  });

  it("should not have stale baseline entries", () => {
    const stale = ratchet(baseline, current).stale;
    expect(
      stale,
      `Found stale baseline entries (file deleted or usage removed, but baseline not updated): ${stale.join(", ")}`
    ).toEqual([]);
  });

  it("should have non-zero baseline entries", () => {
    const zeroEntries = Object.entries(baseline)
      .filter(([, count]) => count === 0)
      .map(([file]) => file);

    expect(zeroEntries, `Found zero-count entries in baseline: ${zeroEntries.join(", ")}`).toEqual([]);
  });

  it("exclusion of src/components/ui/size-class.ts is necessary", () => {
    // Verify that size-class.ts would be flagged if not excluded (it must not be in baseline)
    expect(baseline).not.toHaveProperty("src/components/ui/size-class.ts");
    // The file exists and is excluded, so current should also not have it
    expect(current).not.toHaveProperty("src/components/ui/size-class.ts");
  });
});

describe("design-system-guard: breakpoint token ratchet", () => {
  let baseline: Counts;
  let current: Counts;

  beforeAll(() => {
    baseline = loadBaseline(BREAKPOINT_BASELINE_PATH);
    current = scanAll(BREAKPOINT_PATTERN, BREAKPOINT_EXEMPT);
  });

  it("per-file breakpoint token count may not increase; new files must have 0", () => {
    const report = ratchet(baseline, current);
    expect(
      ratchetFailure("breakpoint", { ...report, decreased: [], stale: [] }),
      "Breakpoint token ratchet failed (offenders listed above)"
    ).toEqual([]);
  });

  it("ratchet tightens: lower the breakpoint baseline when usage decreases", () => {
    const report = ratchet(baseline, current);
    expect(ratchetFailure("breakpoint", { ...report, newFiles: [], increased: [] })).toEqual([]);
  });
});

describe("design-system-guard: size-class wrapper ratchet (approximate)", () => {
  let baseline: Counts;
  let current: Counts;

  beforeAll(() => {
    baseline = loadBaseline(WRAPPER_BASELINE_PATH);
    current = scanAll(SIZE_CLASS_WRAPPER_PATTERN, BREAKPOINT_EXEMPT);
  });

  it("per-file <CompactOnly>/<FromMd> count may not increase; new files must have 0", () => {
    const report = ratchet(baseline, current);
    expect(
      ratchetFailure("wrapper", { ...report, decreased: [], stale: [] }),
      "Size-class wrapper ratchet failed (offenders listed above)"
    ).toEqual([]);
  });

  it("ratchet tightens: lower the wrapper baseline when usage decreases", () => {
    const report = ratchet(baseline, current);
    expect(ratchetFailure("wrapper", { ...report, newFiles: [], increased: [] })).toEqual([]);
  });
});

// Synthetic-string self-test. Does not depend on the repo baseline, so it
// passes at zero baseline too (the old "operative" test failed at 0 hits).
describe("design-system-guard: scanner self-test (synthetic strings)", () => {
  const banned: Array<[string, string]> = [
    ["md:hidden", '<div className="md:hidden fixed" />'],
    ["hidden md:", '<div className="hidden md:flex" />'],
    ["hidden max-md:", '<div className="hidden max-md:flex" />'],
    ["isMobile", "const isMobile = useIsMobile();"],
    ["window.innerWidth", "const w = window.innerWidth;"],
    ["matchMedia", 'window.matchMedia("(min-width: 768px)")'],
    ["useMediaQuery", 'const wide = useMediaQuery("(min-width: 768px)");'],
  ];

  it.each(banned)("banned pattern %s is detected", (_name, sample) => {
    expect(countMatches(sample, BANNED_PATTERN)).toBeGreaterThan(0);
  });

  it("a clean string has zero banned hits", () => {
    const clean = '<div className="flex gap-2 p-4 rounded-lg"><span>Hello</span></div>';
    expect(countMatches(clean, BANNED_PATTERN)).toBe(0);
    expect(scanContents({ "src/components/clean.tsx": clean }, BANNED_PATTERN)).toEqual({});
  });

  it("scanContents counts per file and skips exempt paths", () => {
    const entries = {
      "src/components/a.tsx": "md:hidden md:hidden",
      "src/components/mobile/b.tsx": "md:hidden",
      "src/components/ui/size-class.ts": "isMobile",
      "src/components/c.tsx": "clean",
    };
    expect(scanContents(entries, BANNED_PATTERN, BANNED_EXEMPT)).toEqual({ "src/components/a.tsx": 2 });
    expect(isExempt("src/components/mobile/b.tsx", BANNED_EXEMPT)).toBe(true);
    expect(isExempt("src/components/mobilex.tsx", BANNED_EXEMPT)).toBe(false);
  });

  it("breakpoint pattern counts tokens, including max- variants and 2xl", () => {
    expect(countMatches("md:grid-cols-2", BREAKPOINT_PATTERN)).toBe(1);
    expect(countMatches("max-md:hidden", BREAKPOINT_PATTERN)).toBe(1);
    expect(countMatches("2xl:p-4 sm:p-2 lg:gap-4 xl:w-1", BREAKPOINT_PATTERN)).toBe(4);
    expect(countMatches("sm:a md:b max-sm:c", BREAKPOINT_PATTERN)).toBe(3);
  });

  it("breakpoint pattern ignores container-query tokens (@sm:, @lg:, @[24rem]:) and file-name dots", () => {
    expect(countMatches("@md:grid-cols-2 @lg:p-4", BREAKPOINT_PATTERN)).toBe(0);
    expect(countMatches("@sm:flex @xl:w-1 @[24rem]:p-2", BREAKPOINT_PATTERN)).toBe(0);
    expect(countMatches("md:a @md:b", BREAKPOINT_PATTERN)).toBe(1);
    expect(countMatches("hover:@md:x max-@lg:y", BREAKPOINT_PATTERN)).toBe(0);
    expect(countMatches("see CLAUDE.md: and foo.sm:", BREAKPOINT_PATTERN)).toBe(0);
  });

  it("breakpoint pattern ignores words that merely contain a token", () => {
    expect(countMatches("foo-md:bar hidden-md:x xmd:y", BREAKPOINT_PATTERN)).toBe(0);
    expect(countMatches("md-foo sm lg xl", BREAKPOINT_PATTERN)).toBe(0);
    expect(countMatches("clean string", BREAKPOINT_PATTERN)).toBe(0);
  });

  it("size-class wrapper pattern counts JSX opening tags only", () => {
    expect(countMatches("<CompactOnly>x</CompactOnly>", SIZE_CLASS_WRAPPER_PATTERN)).toBe(1);
    expect(countMatches("<FromMd as=\"span\">", SIZE_CLASS_WRAPPER_PATTERN)).toBe(1);
    expect(countMatches("<CompactOnlyish />", SIZE_CLASS_WRAPPER_PATTERN)).toBe(0);
    expect(countMatches("const x = FromMd;", SIZE_CLASS_WRAPPER_PATTERN)).toBe(0);
  });

  it("ratchet() reports new, increased, decreased and stale entries", () => {
    const r = ratchet({ "a.tsx": 2, "b.tsx": 3, "c.tsx": 1 }, { "a.tsx": 3, "b.tsx": 1, "d.tsx": 1 });
    expect(r.newFiles).toEqual(["d.tsx"]);
    expect(r.increased).toEqual(["a.tsx: 2 -> 3"]);
    expect(r.decreased).toEqual(["b.tsx: 3 -> 1"]);
    expect(r.stale).toEqual(["c.tsx"]);
  });

  it("a zero baseline passes the ratchet for a clean tree", () => {
    const r = ratchet({}, scanContents({ "src/components/x.tsx": "flex" }, BANNED_PATTERN));
    expect(r).toEqual({ newFiles: [], increased: [], decreased: [], stale: [] });
  });
});
