import { test, expect } from "@playwright/test";

/**
 * iOS home-screen PWA safe-area layout. Chromium cannot emulate the notch
 * (env(safe-area-inset-*) is always 0), so we override the single source of
 * truth (--sat/--sab/--sal/--sar in globals.css) with iPhone 14 values.
 */
const INSET_CSS = ":root{--sat:47px;--sab:34px;--sal:0px;--sar:0px}";
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

test("/cloud content starts below the status bar inset", async ({ page }) => {
  await page.goto("/cloud");
  await page.addStyleTag({ content: INSET_CSS });
  // Owner 2026-10-01: no solid strip behind the status bar.
  await expect(page.getByTestId("safe-top-backdrop")).toHaveCount(0);
  const top = await page.evaluate(() => document.body.getBoundingClientRect().top + parseFloat(getComputedStyle(document.body).paddingTop));
  expect(top).toBeGreaterThanOrEqual(47);
  const firstVisible = await page.locator("main, form, h1").first().boundingBox();
  expect(firstVisible!.y).toBeGreaterThanOrEqual(47);
});
