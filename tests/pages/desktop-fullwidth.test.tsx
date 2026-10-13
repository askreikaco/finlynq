// Desktop pages are full width and use the extra width with more columns (owner 2026-10-13).
// Static source checks: no max-w-* / mx-auto page wrapper on the data pages; column rules per page.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8");
// Strip comments so prose about caps does not trip the checks.
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGES: Record<string, string[]> = {
  accounts: ["src/app/(app)/accounts/page.tsx"],
  portfolio: ["src/app/(app)/portfolio/page.tsx", "src/app/(app)/portfolio/_components/holding-account-groups.tsx"],
  transactions: ["src/app/(app)/transactions/page.tsx"],
  reports: ["src/app/(app)/reports/page.tsx"],
  goals: ["src/app/(app)/goals/page.tsx"],
  loans: ["src/app/(app)/loans/page.tsx"],
  more: ["src/app/(app)/more/page.tsx", "src/components/more-menu.tsx"],
};

describe("desktop: data pages are full width", () => {
  for (const [name, files] of Object.entries(PAGES)) {
    it(`/${name} has no max-w-* or mx-auto page wrapper`, () => {
      for (const f of files) {
        const src = code(f);
        // dialogs/fields may keep small caps (max-w-sm etc. on DialogContent); page wrappers may not
        expect(src, f).not.toMatch(/max-w-(report|section|form|doc|console|[2-7]?xl|screen-\w+)\b/);
        expect(src, f).not.toMatch(/\bmx-auto\b/);
      }
    });
  }

  it("the SectionPage / ReportPage 'report' width resolves to no cap", () => {
    expect(code("src/components/templates/section-page.tsx")).toMatch(/report:\s*""/);
    expect(code("src/components/templates/report-page.tsx")).toMatch(/report:\s*""/);
  });
});

describe("desktop: extra width becomes columns", () => {
  it("/accounts: net worth + assets + liabilities tiles in ONE row of 3 at regular+", () => {
    const src = code("src/app/(app)/accounts/page.tsx");
    expect(src).toMatch(/data-slot="accounts-metrics"[^>]*regular:grid-cols-3/);
    expect(src).toMatch(/regular:contents/);
  });

  it("/accounts: Assets and Liabilities side by side (2 columns) at regular+, one column on phone", () => {
    const src = code("src/app/(app)/accounts/page.tsx");
    expect(src).toMatch(/data-slot="accounts-list"[^>]*flex-col[^>]*regular:grid-cols-2/);
  });

  it("/portfolio: holdings account groups in 2 columns at wide", () => {
    expect(code("src/app/(app)/portfolio/_components/holding-account-groups.tsx")).toMatch(/grid-cols-1[^`]*groups\.length > 1 \? " wide:grid-cols-2"/);
  });

  it("/reports: summary tiles in one row, charts in a 2-column grid at wide", () => {
    const src = code("src/app/(app)/reports/page.tsx");
    expect(src).toMatch(/grid-cols-2[^"]*regular:grid-cols-4/);
    expect(src).toMatch(/grid-cols-1[^"]*wide:grid-cols-2/);
  });

  it("/goals and /loans: card lists are a 2-column (3 at wide) grid from regular", () => {
    expect(read("src/components/mobile/section-card.tsx")).toMatch(/regular:grid-cols-2 wide:grid-cols-3/);
    expect(code("src/app/(app)/goals/page.tsx")).toContain("CARD_ROW_GRID");
    expect(code("src/app/(app)/loans/page.tsx")).toContain("CARD_ROW_GRID");
  });

  it("/more: group cards in 1 column on phone, 2 at regular, 3 at wide", () => {
    expect(code("src/components/more-menu.tsx")).toMatch(/grid-cols-1[^"]*regular:grid-cols-2[^"]*wide:grid-cols-3/);
  });
});
