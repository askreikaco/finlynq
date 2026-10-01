/**
 * Playwright config for the mobile-parity e2e (e2e/mobile-*.spec.ts).
 *
 *   MOB_E2E_DATABASE_URL=postgresql://user:pw@127.0.0.1:55432/<name>_test \
 *     npx playwright test -c playwright.mobile.config.ts
 *
 * Same pattern as playwright.family.config.ts: boots its own `next dev --webpack` on
 * MOB_E2E_PORT (default 3927) against a *_test database with throwaway secrets generated here
 * (never read from .env), applies migrations first, captures outgoing mail to a JSONL file.
 * MOB_E2E_CHROMIUM points at a pre-installed Chromium whose revision differs from the bundled one.
 * MOB_E2E_REUSE=1 reuses an already running server on that port.
 */
import { defineConfig } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.MOB_E2E_PORT || 3927);
const DATABASE_URL = process.env.MOB_E2E_DATABASE_URL || process.env.DATABASE_URL || "";
if (!/\/[^/]*_test([?#]|$)/.test(DATABASE_URL)) {
  throw new Error("Set MOB_E2E_DATABASE_URL to a *_test database (the e2e creates users and wipes nothing else)");
}
// MOB_E2E_SECRET_SEED makes the throwaway secrets deterministic so a saved session (MOB1_STATE_FILE)
// stays valid across server restarts. Unset -> random per run.
const secret = (name: string) =>
  process.env.MOB_E2E_SECRET_SEED
    ? createHash("sha256").update(`${process.env.MOB_E2E_SECRET_SEED}:${name}`).digest("hex")
    : randomBytes(32).toString("hex");
const BASE_URL = `http://localhost:${PORT}`;
const CAPTURE = path.join(tmpdir(), `finlynq-mobile-e2e-${PORT}.jsonl`);

process.env.BASE_URL = BASE_URL;
process.env.DATABASE_URL = DATABASE_URL;
process.env.FINLYNQ_EMAIL_CAPTURE = CAPTURE;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /mobile-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: "list",
  globalSetup: "./e2e/family-global-setup.ts",
  use: {
    baseURL: BASE_URL,
    launchOptions: process.env.MOB_E2E_CHROMIUM ? { executablePath: process.env.MOB_E2E_CHROMIUM } : {},
  },
  webServer: {
    command: `node scripts/run-migrations.mjs && npx next dev --webpack -p ${PORT}`,
    url: `${BASE_URL}/api/auth/session`,
    reuseExistingServer: !!process.env.MOB_E2E_REUSE,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL,
      PF_JWT_SECRET: secret("jwt"),
      PF_PEPPER: secret("pepper"),
      PF_STAGING_KEY: secret("staging"),
      APP_URL: BASE_URL,
      FINLYNQ_EMAIL_CAPTURE: CAPTURE,
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "development",
    },
  },
});
