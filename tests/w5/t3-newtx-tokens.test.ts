// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "src/components/transactions/entry");
const FILES = ["split-section.tsx", "numpad.tsx", "autocomplete-pills.tsx"];
const LEGACY = /\b(zinc|indigo)-\d|text-white|bg-black/g;

describe("W5-17 new-transaction components B use semantic tokens", () => {
  for (const f of FILES) {
    it(`${f} has no raw zinc/indigo/white/black utility classes`, () => {
      const src = readFileSync(path.join(DIR, f), "utf8");
      expect(src.match(LEGACY) ?? []).toEqual([]);
    });
  }
});
