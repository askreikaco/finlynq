import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("W5-15 /transactions/new page uses semantic tokens", () => {
  it("has no raw zinc/indigo palette, text-white or bg-black classes", () => {
    const src = fs.readFileSync(
      "src/app/(app)/transactions/new/page.tsx",
      "utf-8"
    );
    const matches = src.match(/\b(zinc|indigo)-\d|text-white|bg-black/g) ?? [];
    expect(matches, `raw palette classes left: ${matches.join(", ")}`).toHaveLength(0);
  });
});
