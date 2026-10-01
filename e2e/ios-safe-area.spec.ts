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
  const backdrop = page.getByTestId("safe-top-backdrop");
  await expect(backdrop).toHaveCSS("position", "fixed");
  expect((await backdrop.boundingBox())!.height).toBe(47);
  const top = await page.evaluate(() => document.body.getBoundingClientRect().top + parseFloat(getComputedStyle(document.body).paddingTop));
  expect(top).toBeGreaterThanOrEqual(47);
  const firstVisible = await page.locator("main, form, h1").first().boundingBox();
  expect(firstVisible!.y).toBeGreaterThanOrEqual(47);
});
