/**
 * Playwright config for the Family Wealth e2e (e2e/family-*.spec.ts).
 *
 *   FAMILY_E2E_DATABASE_URL=postgresql://user:pw@127.0.0.1:55432/<name>_test \
 *     npx playwright test -c playwright.family.config.ts
 *
 * Boots its own `next dev` on FAMILY_E2E_PORT (default 3917) against that *_test database with
 * throwaway secrets generated here (never read from .env), applies the migrations first, and
 * captures outgoing mail to a JSONL file (FINLYNQ_EMAIL_CAPTURE, test-only hook in email.ts).
 * `--webpack` is used because Turbopack rejects a symlinked node_modules (git worktrees);
 * set FAMILY_E2E_TURBOPACK=1 to use the default bundler.
 */
import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.FAMILY_E2E_PORT || 3917);
const DATABASE_URL = process.env.FAMILY_E2E_DATABASE_URL || process.env.DATABASE_URL || "";
if (!/\/[^/]*_test([?#]|$)/.test(DATABASE_URL)) {
  throw new Error("Set FAMILY_E2E_DATABASE_URL to a *_test database (the e2e creates users and wipes nothing else)");
}
const BASE_URL = `http://localhost:${PORT}`;
const CAPTURE = path.join(tmpdir(), `finlynq-family-e2e-${PORT}.jsonl`);

// Test workers read these from process.env; the dev server gets the same plus the secrets.
process.env.BASE_URL = BASE_URL;
process.env.DATABASE_URL = DATABASE_URL;
process.env.FINLYNQ_EMAIL_CAPTURE = CAPTURE;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /family-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: "list",
  globalSetup: "./e2e/family-global-setup.ts",
  use: {
    baseURL: BASE_URL,
    // Optional: point at a pre-installed Chromium whose revision differs from the bundled one.
    launchOptions: process.env.FAMILY_E2E_CHROMIUM ? { executablePath: process.env.FAMILY_E2E_CHROMIUM } : {},
  },
  webServer: {
    command: `node scripts/run-migrations.mjs && npx next dev ${process.env.FAMILY_E2E_TURBOPACK ? "" : "--webpack "}-p ${PORT}`,
    url: `${BASE_URL}/api/auth/session`,
    reuseExistingServer: !!process.env.FAMILY_E2E_REUSE,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL,
      PF_JWT_SECRET: randomBytes(32).toString("hex"),
      PF_PEPPER: randomBytes(32).toString("hex"),
      PF_STAGING_KEY: randomBytes(32).toString("hex"),
      APP_URL: BASE_URL,
      FINLYNQ_EMAIL_CAPTURE: CAPTURE,
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "development",
    },
  },
});
