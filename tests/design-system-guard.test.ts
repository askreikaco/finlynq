import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const BASELINE_PATH = "tests/fixtures/adaptive-baseline.json";
const BANNED_PATTERNS = /md:hidden|hidden\s+md:|isMobile|window\.innerWidth/gi;

interface Baseline {
  [file: string]: number;
}

function loadBaseline(): Baseline {
  const content = fs.readFileSync(BASELINE_PATH, "utf-8");
  return JSON.parse(content);
}

function scanAdaptiveUsage(): Baseline {
  const results: Baseline = {};

  // Get all TypeScript/TSX files from src/app and src/components
  let files: string[] = [];
  try {
    const appFiles = execSync(
      "find src/app -type f \\( -name '*.tsx' -o -name '*.ts' \\)"
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    const componentFiles = execSync(
      "find src/components -type f \\( -name '*.tsx' -o -name '*.ts' \\)"
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    files = [...appFiles, ...componentFiles];
  } catch {
    console.error("Failed to find files");
    return results;
  }

  for (const file of files) {
    // Skip excluded files
    if (
      file === "src/components/ui/size-class.ts" ||
      file.includes("src/components/mobile/")
    ) {
      continue;
    }

    try {
      const content = fs.readFileSync(file, "utf-8");
      const matches = (content.match(BANNED_PATTERNS) || []).length;

      if (matches > 0) {
        results[file] = matches;
      }
    } catch {
      // File may have been deleted, skip
    }
  }

  return results;
}

describe("design-system-guard: ratchet for adaptive patterns", () => {
  let baseline: Baseline;
  let current: Baseline;

  beforeAll(() => {
    baseline = loadBaseline();
    current = scanAdaptiveUsage();
  });

  it("should not have new files using banned adaptive patterns", () => {
    const newFiles = Object.keys(current).filter((file) => !baseline[file]);
    expect(
      newFiles,
      `Found new files with adaptive patterns: ${newFiles.join(", ")}`
    ).toEqual([]);
  });

  it("should not increase usage count in existing files", () => {
    const increased = Object.entries(baseline)
      .filter(([file, count]) => {
        const currentCount = current[file] ?? 0;
        return currentCount > count;
      })
      .map(([file, baselineCount]) => {
        const currentCount = current[file] ?? 0;
        return `${file}: ${baselineCount} -> ${currentCount}`;
      });

    expect(
      increased,
      `Found files with increased adaptive pattern usage: ${increased.join(", ")}`
    ).toEqual([]);
  });

  it("should not have stale baseline entries", () => {
    const stale = Object.keys(baseline).filter((file) => {
      const currentCount = current[file] ?? 0;
      return currentCount === 0;
    });

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

  it("ratchet is operative: scan loop runs and finds patterns", () => {
    // Non-vacuous test: verify the scan actually found patterns
    const patternCount = Object.values(current).reduce((a, b) => a + b, 0);
    expect(patternCount).toBeGreaterThan(0);
  });
});
