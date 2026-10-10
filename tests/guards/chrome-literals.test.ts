// Guard (b): chrome literals in route-owned source (src/app/(app)/**) may not grow. Per-file, per-rule ratchet,
// stored in tests/guards/baselines/<family>.json. Tight: a count that drops must be written back into the baseline.
// New files must have 0 hits. A file that is not owned by a route family has no baseline and must have 0 hits.
import { describe, it, expect } from "vitest";
import {
  CHROME_RULES,
  currentChrome,
  flattenChrome,
  listAppFiles,
  loadBaselines,
  ownerFamilyOf,
  readFiles,
  scopeFiles,
} from "./scan";
import { countMatches, ratchet, scanContents, type Counts } from "../helpers/adaptive-scan";

const files = listAppFiles();
const contents = readFiles(files);
const baselines = loadBaselines();

function reportLines(label: string, r: ReturnType<typeof ratchet>): string[] {
  const lines: string[] = [];
  if (r.newFiles.length) lines.push(`${label} new files (baseline must be 0): ${r.newFiles.join(", ")}`);
  if (r.increased.length) lines.push(`${label} increased (may only go down): ${r.increased.join("; ")}`);
  if (r.decreased.length) lines.push(`${label} decreased, lower the baseline: ${r.decreased.join("; ")}`);
  if (r.stale.length) lines.push(`${label} stale baseline entries (0 hits, remove): ${r.stale.join(", ")}`);
  return lines;
}

describe("chrome-literals guard: baseline hygiene", () => {
  it("baseline rule ids are all known", () => {
    const known = new Set(CHROME_RULES.map((r) => r.id));
    const unknown: string[] = [];
    for (const [name, b] of Object.entries(baselines)) {
      for (const [file, rules] of Object.entries(b.chrome)) {
        for (const id of Object.keys(rules)) if (!known.has(id)) unknown.push(`${name}.json ${file} ${id}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("baseline files are owned by the family they sit in", () => {
    const wrong: string[] = [];
    for (const [name, b] of Object.entries(baselines)) {
      for (const file of Object.keys(b.chrome)) {
        const owner = ownerFamilyOf(file);
        if (owner !== b.family) wrong.push(`${file} in ${name}.json but owned by ${owner ?? "nobody"}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("baselines hold no zero counts", () => {
    const zeros: string[] = [];
    for (const b of Object.values(baselines)) {
      for (const [file, rules] of Object.entries(b.chrome)) {
        for (const [id, n] of Object.entries(rules)) if (!(n > 0)) zeros.push(`${file} ${id}=${n}`);
      }
    }
    expect(zeros).toEqual([]);
  });
});

describe("chrome-literals guard: per-rule ratchet over src/app/(app)", () => {
  it.each(CHROME_RULES.map((r) => [r.id, r] as const))("rule %s: no new files, no increase, no stale or decreased baseline", (_id, rule) => {
    const current: Counts = currentChrome(rule, files, contents);
    const baseline = flattenChrome(baselines, rule.id);
    const report = ratchet(baseline, current);
    expect(reportLines(`${rule.label}`, report), `Chrome literal ratchet failed for "${rule.label}"`).toEqual([]);
  });
});

describe("chrome-literals guard: scanner logic (in-memory mutation self-check)", () => {
  const FILE = "src/app/(app)/zz-guard-probe/_components/probe.tsx";
  const PAGE = "src/app/(app)/zz-guard-probe/page.tsx";

  it.each(CHROME_RULES.map((r) => [r.id, r] as const))("rule %s: its sample literal matches exactly once", (_id, rule) => {
    expect(countMatches(rule.sample, rule.pattern)).toBe(1);
  });

  it.each(CHROME_RULES.map((r) => [r.id, r] as const))("rule %s: an added literal is counted and fails against an empty baseline", (_id, rule) => {
    const entries = { [rule.pageOnly ? PAGE : FILE]: `export const X = () => <div>${rule.sample}</div>;` };
    const current = currentChrome(rule, Object.keys(entries), entries);
    const key = Object.keys(entries)[0];
    expect(current[key]).toBe(1);
    expect(ratchet({}, current).newFiles).toEqual([key]);
  });

  it("growth: one extra literal in a baselined file is an increase", () => {
    const rule = CHROME_RULES[0];
    const key = FILE;
    const base = { [key]: 1 };
    const grown = scanContents({ [key]: `${rule.sample}\n${rule.sample}` }, rule.pattern);
    expect(ratchet(base, grown).increased).toEqual([`${key}: 1 -> 2`]);
  });

  it("a literal removed from a baselined file is a decrease that must be written back", () => {
    const rule = CHROME_RULES[0];
    const base = { [FILE]: 2 };
    const fewer = scanContents({ [FILE]: rule.sample }, rule.pattern);
    expect(ratchet(base, fewer).decreased).toEqual([`${FILE}: 2 -> 1`]);
  });

  it("suspense-null counts only page.tsx files", () => {
    const rule = CHROME_RULES.find((r) => r.id === "suspense-null")!;
    const scoped = scopeFiles(rule, [PAGE, FILE]);
    expect(scoped).toEqual([PAGE]);
  });

  it("oklch is exempt in globals.css and tokens.ts only", () => {
    const rule = CHROME_RULES.find((r) => r.id === "oklch")!;
    const counted = scanContents(
      {
        "src/app/globals.css": "--a: oklch(1 0 0);",
        "src/lib/design/tokens.ts": "export const t = 'oklch(1 0 0)';",
        "src/app/(app)/zz-guard-probe/page.tsx": "const c = 'oklch(1 0 0)';",
      },
      rule.pattern,
      rule.exempt ?? []
    );
    expect(counted).toEqual({ "src/app/(app)/zz-guard-probe/page.tsx": 1 });
  });

  it("the probe paths are not real files", () => {
    expect(files).not.toContain(FILE);
    expect(files).not.toContain(PAGE);
  });
});
