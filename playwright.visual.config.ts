/**
 * Manual visual/structural harness config (e2e/visual/size-classes.spec.ts).
 *
 * NOT part of CI and NOT part of vitest. Nothing here starts a server or a database: point
 * FINLYNQ_VISUAL_BASE_URL at an already running app (see docs/design-system.md, "Visual harness").
 * A dry run (`npx playwright test -c playwright.visual.config.ts --list`) needs no env at all.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/visual",
  testMatch: /size-classes\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Every cell runs even after earlier failures: one bad cell must not hide the other 53.
  maxFailures: 0,
  timeout: 600_000,
  reporter: "list",
  use: {
    baseURL: process.env.FINLYNQ_VISUAL_BASE_URL ?? "",
    // Optional: a pre-installed Chromium whose revision differs from the bundled one.
    launchOptions: process.env.FINLYNQ_VISUAL_CHROMIUM
      ? { executablePath: process.env.FINLYNQ_VISUAL_CHROMIUM }
      : {},
  },
});
