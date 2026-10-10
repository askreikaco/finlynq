// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "src/app/(app)/transactions/new/_components");
const FILES = ["split-section.tsx", "numpad.tsx", "autocomplete-pills.tsx"];
const LEGACY = /\b(zinc|indigo)-\d|text-white|bg-black/g;

describe("W5-17 new-transaction components B use semantic tokens", () => {
  for (const f of FILES) {
    it(`${f} has no raw zinc/indigo/white/black utility classes`, () => {
      const src = readFileSync(path.join(DIR, f), "utf8");
      expect(src.match(LEGACY) ?? []).toEqual([]);
    });
  }

  it("split-section remove button uses semantic classes and has an aria-label", () => {
    const src = readFileSync(path.join(DIR, "split-section.tsx"), "utf8");
    expect(src).toContain(
      'className="text-muted-foreground hover:text-destructive p-1 max-regular:p-3 max-regular:-m-3 rounded-md transition-colors"',
    );
    expect(src).toContain('aria-label="Remove split"');
  });
});
