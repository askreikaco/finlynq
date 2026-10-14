import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Owner rule: rows are square. Hover/press/selected backgrounds are full-bleed rectangles inside the card
// (the card box clips the first/last row with overflow-hidden), so no rounded-* on TxRow / ListRow.
const src = (f: string) => readFileSync(`src/components/mobile/${f}`, "utf8");

describe("TxRow / ListRow carry no border radius", () => {
  for (const f of ["tx-row.tsx", "list-row.tsx"]) {
    it(`${f}: no rounded-* on the row (circle tile excluded)`, () => {
      const stripped = src(f).replace(/rounded-full/g, "");
      expect(stripped).not.toMatch(/\brounded(-[a-z0-9\[\]./]+)?\b/);
    });
  }
});
