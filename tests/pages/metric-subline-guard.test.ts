import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("every value-only metric tile has a sub-line (delta or muted caption)", () => {
  it("subscriptions: Per month and Per year carry a caption", () => {
    const src = code("src/app/(app)/subscriptions/page.tsx");
    expect(src).toMatch(/label: "Per month"[^\n]*sub: /);
    expect(src).toMatch(/label: "Per year"[^\n]*sub: "Annualised"/);
  });
  it("portfolio summary: Holdings and Accounts captions; the rest fall back to NO_HISTORY_CAPTION", () => {
    const src = code("src/app/(app)/portfolio/_components/mobile-portfolio.tsx");
    expect(src).toMatch(/label: "Holdings"[^\n]*sub: `Across/);
    expect(src).toMatch(/label: "Accounts"[^\n]*sub: `/);
    expect(src).toMatch(/m\.sub \? m : \{ \.\.\.m, sub: NO_HISTORY_CAPTION \}/);
  });
  it("dividends + realized gains tiles fall back to NO_HISTORY_CAPTION when there is no delta", () => {
    for (const f of ["src/app/(app)/portfolio/dividends/page.tsx", "src/app/(app)/portfolio/realized-gains/page.tsx"]) {
      const src = code(f);
      expect(src.match(/\.delta \?\? NO_HISTORY_CAPTION/g)?.length, f).toBeGreaterThanOrEqual(2);
    }
  });
});
