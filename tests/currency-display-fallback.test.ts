import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Test: verify that display-reaching components use displayCurrency
 *
 * This test checks the actual source code to verify that components
 * that render currency values use the CurrencyProvider's displayCurrency
 * instead of hardcoded USD/CAD fallbacks.
 *
 * This is a proof that the code fixes are in place.
 */

const COMPONENTS_THAT_DISPLAY_CURRENCY = [
  {
    file: "src/components/staging/reconciliation-callout.tsx",
    mustHave: ["useDisplayCurrency"],
    mustNotHave: ['?? "USD"'],
    reason: "Shows bank reconciliation amounts in displayCurrency",
  },
  {
    file: "src/components/staging/balance-warning-banner.tsx",
    mustHave: ["useDisplayCurrency", "displayCurrency"],
    mustNotHave: ['currency ?? "USD"'],
    reason: "Shows balance warning amounts in displayCurrency",
  },
  {
    file: "src/components/reconcile/preview-table.tsx",
    mustHave: ["useDisplayCurrency"],
    mustNotHave: ['?? "USD"'],
    reason: "Shows reconcile preview amounts in displayCurrency",
  },
  {
    file: "src/app/(app)/portfolio/dividends/page.tsx",
    mustHave: ["useDisplayCurrency"],
    mustNotHave: ['?? "USD"'],
    reason: "Shows dividend amounts in displayCurrency",
  },
  {
    file: "src/app/(app)/dashboard/_components/health-info-dialog.tsx",
    mustHave: ["useDisplayCurrency"],
    mustNotHave: ['?? displayCurrency ?? "USD"'],
    reason: "Shows health info amounts in displayCurrency (removed USD tail)",
  },
  {
    file: "src/components/portfolio/PerformanceChart.tsx",
    mustHave: ["useDisplayCurrency"],
    mustNotHave: ['?? "USD"'],
    reason: "Shows performance chart amounts in displayCurrency",
  },
  {
    file: "src/components/import/staged-review-surface.tsx",
    mustHave: ["useDisplayCurrency"],
    mustNotHave: ['?? "USD"'],
    reason: "Shows import staging amounts in displayCurrency",
  },
  {
    file: "src/components/net-worth-history-chart.tsx",
    mustHave: ["displayCurrency"],
    mustNotHave: ['?? "CAD"'],
    reason: "Uses displayCurrency without fallback tail",
  },
  {
    file: "src/app/(app)/settings/investments/securities/[id]/prices/page.tsx",
    mustHave: ["useDisplayCurrency", "displayCurrency"],
    mustNotHave: ['?? "USD"'],
    reason: "Investment prices page falls back to displayCurrency",
  },
  {
    file: "src/app/(app)/settings/general/page.tsx",
    mustHave: ["displayCurrency"],
    mustNotHave: ['?? "USD"'],
    reason: "Uses displayCurrency for currency selection default",
  },
];

describe("Currency Display Fallback Fixes", () => {
  for (const component of COMPONENTS_THAT_DISPLAY_CURRENCY) {
    it(`${component.file}: ${component.reason}`, () => {
      const filePath = path.join(process.cwd(), component.file);
      const content = fs.readFileSync(filePath, "utf-8");

      // Check that all required patterns are present
      for (const mustHave of component.mustHave) {
        expect(
          content.includes(mustHave),
          `Expected to find "${mustHave}" in ${component.file}`
        ).toBe(true);
      }

      // Check that no forbidden patterns are present
      for (const mustNotHave of component.mustNotHave) {
        expect(
          content.includes(mustNotHave),
          `Should NOT find "${mustNotHave}" in ${component.file} - use displayCurrency instead`
        ).toBe(false);
      }
    });
  }
});
