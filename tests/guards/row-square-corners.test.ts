import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Owner rule: rows are square. Hover/press/selected backgrounds are full-bleed rectangles inside the card
// (the card box clips the first/last row with overflow-hidden), so no rounded-* on TxRow / ListRow.
const src = (f: string) => readFileSync(`src/components/mobile/${f}`, "utf8");

describe("ListRow is square unless shape=\"rounded\" is passed", () => {
  it("list-row.tsx: the only radii are circles (rounded-full) and the explicit rounded shape", () => {
    const code = src("list-row.tsx")
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join("\n");
    const tokens = new Set(code.match(/(?<![\w-])rounded(-[a-z0-9\[\]./]+)?(?![\w-])/g) ?? []);
    // "rounded" alone appears in the shape union / compare only; as a class it must carry a suffix.
    const classTokens = Array.from(tokens).filter((t) => t !== "rounded");
    expect(classTokens.sort()).toEqual(["rounded-full", "rounded-group"]);
    expect(code).toContain('shape === "rounded" && "rounded-group"');
    expect(code.match(/rounded-group/g)).toHaveLength(1);
    expect(code).toContain('shape = "square"');
  });

  for (const f of ["tx-row.tsx", "account-row.tsx", "holding-row.tsx"]) {
    it(`${f}: wrapper has no border radius`, () => {
      expect(src(f)).not.toMatch(/\brounded(-[a-z0-9\[\]./]+)?\b/);
    });
  }
});
