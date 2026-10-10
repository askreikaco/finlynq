import { describe, it, expect } from "vitest";
import * as fs from "fs";

// W5-16: /transactions/new picker components must use semantic theme tokens
// (no raw Tailwind zinc/indigo/emerald/rose palette classes, no bare text-white).
const DIR = "src/components/transactions/entry";
const FILES = ["account-selector.tsx", "category-selector.tsx"];
const PALETTE = /-(zinc|indigo|emerald|rose)-\d{2,3}\b/;
const BARE_WHITE = /(^|[\s"'`])text-white(?=[\s"'`])/;

describe("new-transaction pickers use semantic tokens (W5-16)", () => {
  for (const f of FILES) {
    it(`${f} has no raw zinc/indigo/emerald/rose palette classes`, () => {
      const content = fs.readFileSync(`${DIR}/${f}`, "utf-8");
      const hit = content.split("\n").find((l) => PALETTE.test(l));
      expect(hit, `palette class found: ${hit}`).toBeUndefined();
    });

    it(`${f} has no bare text-white class`, () => {
      const content = fs.readFileSync(`${DIR}/${f}`, "utf-8");
      const hit = content.split("\n").find((l) => BARE_WHITE.test(l));
      expect(hit, `text-white found: ${hit}`).toBeUndefined();
    });
  }
});
