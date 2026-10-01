/**
 * Multi-account switcher e2e (B4). The worker fixture in e2e/multi-account/fixtures.ts
 * starts its OWN local app (next dev --webpack, free port, throwaway secrets generated
 * per run) against a *_test Postgres DB, and can restart it (evicts every in-memory DEK).
 *
 *   DATABASE_URL=postgresql://.../ma4_test node scripts/run-migrations.mjs
 *   npx playwright test -c playwright.multiacct.config.ts
 *   (MA_E2E_CHROMIUM=<path> optional: pre-installed Chromium executable)
 *
 * Never reads .env. Refuses to run unless the DB name ends in `_test`.
 * Do NOT run it concurrently with the vitest DB suites on the same database (they reset tables).
 */
import { defineConfig } from "@playwright/test";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/\/[^/]*_test([?#]|$)/.test(dbUrl)) throw new Error("DATABASE_URL must point at a *_test database");

export default defineConfig({
  testDir: "./e2e/multi-account",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    actionTimeout: 20_000,
    navigationTimeout: 120_000,
    // Optional: pre-installed Chromium whose revision differs from the bundled one.
    launchOptions: process.env.MA_E2E_CHROMIUM ? { executablePath: process.env.MA_E2E_CHROMIUM } : {},
  },
});
