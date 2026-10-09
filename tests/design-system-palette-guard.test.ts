// @vitest-environment node
// W6-60: palette ratchet. Hardcoded Tailwind palette colour classes are banned in src/app and
// src/components; use the theme tokens (docs/design-system.md "Colour tokens"). Files that still
// carry hits are listed in tests/fixtures/palette-baseline.json and may only go down.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const BASELINE_PATH = "tests/fixtures/palette-baseline.json";
const PALETTE = /\b(bg|text|border|ring|from|to|via|fill|stroke|outline|divide|ring-offset|shadow|decoration|accent|caret|placeholder|border-[trblxy]|border-[se])-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b/g;
const ROOTS = ["src/app", "src/components"];

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(p);
  }
}

function scan(): Record<string, number> {
  const files: string[] = [];
  for (const r of ROOTS) walk(r, files);
  const res: Record<string, number> = {};
  for (const f of files) {
    const n = (readFileSync(f, "utf8").match(PALETTE) ?? []).length;
    if (n > 0) res[f] = n;
  }
  return res;
}

describe("design-system-palette-guard", () => {
  let baseline: Record<string, number>;
  let current: Record<string, number>;
  beforeAll(() => {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    current = scan();
  });

  it("no new files with palette classes", () => {
    expect(Object.keys(current).filter((f) => !(f in baseline))).toEqual([]);
  });
  it("no file increases its palette count", () => {
    expect(Object.entries(current).filter(([f, n]) => n > (baseline[f] ?? 0)).map(([f]) => f)).toEqual([]);
  });
  it("baseline is lowered when a file drops hits", () => {
    expect(Object.entries(baseline).filter(([f, n]) => (current[f] ?? 0) < n).map(([f]) => f)).toEqual([]);
  });
  it("scanner is operative (regex matches a known palette class)", () => {
    expect("x bg-rose-500 y".match(PALETTE)).toEqual(["bg-rose-500"]);
    expect("x bg-destructive/10 dark:text-pos y".match(PALETTE)).toBeNull();
  });
});
