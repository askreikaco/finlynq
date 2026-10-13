// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { insightColumns, EMPTY_CELL_CLASS } from "@/lib/dashboard-layout";
import { countRenderedCells } from "@/app/(app)/dashboard/_components/counted-grid";

describe("insightColumns", () => {
  const wide = (n: number) => /wide:grid-cols-(\d)/.exec(insightColumns(n))?.[1] ?? "1";
  it.each([
    [0, "1"], [1, "1"], [2, "2"], [3, "3"], [4, "2"], [5, "3"], [6, "3"], [7, "3"], [8, "3"],
  ])("count %i -> %s wide columns", (n, cols) => {
    expect(wide(n)).toBe(cols);
    expect(insightColumns(n)).toMatch(/^grid-cols-1/);
  });
  it("4 cards never leave an orphan (2x2) and phone stays 1 column", () => {
    expect(insightColumns(4)).toBe("grid-cols-1 regular:grid-cols-2 wide:grid-cols-2");
  });
  it("empty cells collapse and are not counted", () => {
    expect(EMPTY_CELL_CLASS).toBe("empty:hidden");
    const root = document.createElement("div");
    root.innerHTML = '<div class="empty:hidden"></div><div class="empty:hidden"><p>a</p></div><div class="contents"><section>b</section><section>c</section></div>';
    expect(countRenderedCells(root)).toBe(3);
  });
});
