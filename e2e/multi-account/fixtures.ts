/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture `use` callback is not a React hook */
import { test as base, expect, request as pwRequest, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";
import crypto from "crypto";
import net from "net";

export { expect };

export const MAX_ACCOUNTS = 5;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Server {
  proc: ChildProcess | null = null;
  constructor(
    readonly port: number,
    private readonly env: Record<string, string>,
  ) {}
  get url() {
    return `http://127.0.0.1:${this.port}`;
  }
  async start() {
    this.proc = spawn("npx", ["next", "dev", "--webpack", "-p", String(this.port), "-H", "127.0.0.1"], {
      env: { ...process.env, ...this.env },
      stdio: "ignore",
      detached: true,
    });
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${this.url}/api/healthz`);
        if (r.ok) return;
      } catch {
        /* not up yet */
      }
      await sleep(1000);
    }
    throw new Error("next dev did not become healthy");
  }
  async stop() {
    const p = this.proc;
    this.proc = null;
    if (!p || !p.pid) return;
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        await fetch(`${this.url}/api/healthz`, { signal: AbortSignal.timeout(500) });
      } catch {
        return;
      }
      await sleep(300);
    }
    try {
      process.kill(-p.pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  /** Restart = every in-memory DEK is gone; JWTs stay valid (same secret). */
  async restart() {
    await this.stop();
    await sleep(1000);
    await this.start();
  }
}

export interface TestUser {
  username: string;
  email: string;
  password: string;
  displayName: string;
  /** Filled after register (via /api/auth/session as that user). */
  id?: string;
}

const hex = () => crypto.randomBytes(32).toString("hex");
export const randomIp = () => `10.${crypto.randomInt(1, 250)}.${crypto.randomInt(1, 250)}.${crypto.randomInt(1, 250)}`;

export const test = base.extend<{ srv: Server; baseURL: string }, { server: Server }>({
  server: [
    async ({}, use) => {
      const dbUrl = process.env.DATABASE_URL ?? "";
      if (!/\/[^/]*_test([?#]|$)/.test(dbUrl)) throw new Error("DATABASE_URL must point at a *_test database");
      const server = new Server(await freePort(), {
        DATABASE_URL: dbUrl,
        // Throwaway secrets, generated per run. Never read from .env.
        PF_JWT_SECRET: hex(),
        PF_PEPPER: hex(),
        PF_STAGING_KEY: hex(),
        NEXT_TELEMETRY_DISABLED: "1",
      });
      await server.start();
      await use(server);
      await server.stop();
    },
    { scope: "worker", timeout: 300_000 },
  ],
  srv: async ({ server }, use) => use(server),
  baseURL: async ({ server }, use) => use(server.url),
});

// ─── helpers ────────────────────────────────────────────────────────────────

/** Register a throwaway user through the API in an isolated cookie jar. */
export async function registerUser(baseURL: string, tag: string): Promise<TestUser> {
  const suffix = crypto.randomBytes(4).toString("hex");
  const u: TestUser = {
    username: `ma4-${tag}-${suffix}`,
    email: `ma4-${tag}-${suffix}@example.test`,
    password: `Qz7!${crypto.randomBytes(9).toString("base64url")}-Aa1`,
    displayName: `User ${tag.toUpperCase()}`,
  };
  const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  try {
    const res = await ctx.post("/api/auth/register", {
      data: { username: u.username, email: u.email, password: u.password, displayName: u.displayName },
    });
    if (!res.ok()) throw new Error(`register ${tag}: ${res.status()} ${await res.text()}`);
    const sess = await (await ctx.get("/api/auth/session")).json();
    u.id = sess.userId;
    // Skip the first-run wizard (its modal overlay would cover the account menu).
    const done = await ctx.post("/api/onboarding/complete", { headers: { origin: baseURL } });
    if (!done.ok()) throw new Error(`onboarding/complete ${tag}: ${done.status()}`);
    // ...and the first-visit display-currency prompt dialog.
    const cur = await ctx.post("/api/prompts/display_currency/answer", {
      headers: { origin: baseURL },
      data: { version: 1, answer: { currency: "USD" } },
    });
    if (!cur.ok()) throw new Error(`display_currency ${tag}: ${cur.status()} ${await cur.text()}`);
  } finally {
    await ctx.dispose();
  }
  return u;
}

/** Fresh client IP per login (login is rate limited 5/min/IP). */
export async function freshIp(context: BrowserContext) {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
}

/** next dev: a submit before hydration would be a native GET form post. Wait for React to own the form. */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const f = document.querySelector("form");
    return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps"));
  });
}

export async function loginForm(page: Page, user: TestUser) {
  await waitForHydration(page);
  await freshIp(page.context());
  await page.getByPlaceholder(/username or/i).fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.locator('form button[type="submit"]').click();
}

/** Plain sign-in from the login page; lands on /dashboard. */
export async function signIn(page: Page, user: TestUser) {
  await page.goto("/cloud");
  await loginForm(page, user);
  await page.waitForURL(/\/dashboard/);
  await expectActive(page, user);
  await expect(menuTrigger(page)).toBeVisible();
}

export const menuTrigger = (page: Page) => page.locator('button[aria-label="Account menu"]').locator("visible=true").first();

export async function openMenu(page: Page) {
  await menuTrigger(page).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** Account switcher -> "Add another account" -> login form in add mode. */
export async function addViaMenu(page: Page, user: TestUser) {
  await openMenu(page);
  await page.getByRole("menuitem", { name: /add another account/i }).click();
  await page.waitForURL(/\/cloud\?add=1/);
  await loginForm(page, user);
  await page.waitForURL(/\/dashboard/);
  await expectActive(page, user);
}

/**
 * Run an action that must end in a FULL page load (hardReload), even when the
 * target URL equals the current one: a window marker set before the action
 * disappears only if the document was really replaced.
 */
export async function expectHardReload(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    (window as unknown as { __maMarker?: number }).__maMarker = 1;
  });
  await action();
  await page.waitForFunction(() => !(window as unknown as { __maMarker?: number }).__maMarker, undefined, { timeout: 90_000 });
  await page.waitForLoadState("domcontentloaded");
}

export async function switchTo(page: Page, user: TestUser) {
  await openMenu(page);
  await expectHardReload(page, () =>
    page.getByRole("menuitem", { name: new RegExp(user.email.replace(/[.+]/g, "\\$&")) }).click(),
  );
  await page.waitForURL(/\/dashboard/);
  // hard reload happened; wait for the new session to be reflected
  await expectActive(page, user);
}

export async function session(page: Page): Promise<{ authenticated?: boolean; userId: string | null; email?: string | null }> {
  for (let i = 0; ; i++) {
    try {
      return await page.evaluate(async () => {
        const r = await fetch("/api/auth/session", { cache: "no-store" });
        return r.ok ? await r.json() : { userId: null };
      });
    } catch (e) {
      if (i >= 5) throw e; // context destroyed by an in-flight navigation: retry
      await page.waitForTimeout(500);
    }
  }
}

export async function expectActive(page: Page, user: TestUser) {
  await expect.poll(async () => (await session(page)).userId).toBe(user.id);
}

export interface AccountRow {
  userId: string;
  email: string;
  active: boolean;
  status: string;
}
export async function accountsList(page: Page): Promise<AccountRow[]> {
  return page.evaluate(async () => {
    const r = await fetch("/api/auth/accounts", { cache: "no-store" });
    return r.ok ? r.json() : [];
  });
}

/** Create a uniquely named account (data row) as the ACTIVE user via the app's own fetch (same-origin). */
export async function createDataAccount(page: Page, name: string) {
  const status = await page.evaluate(async (n) => {
    const r = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, type: "A", group: "Cash", currency: "USD" }),
    });
    return r.status;
  }, name);
  expect(status).toBe(201);
}

export async function dataAccountNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const r = await fetch("/api/accounts", { cache: "no-store" });
    if (!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).map((a: { name?: string }) => a.name ?? "");
  });
}

export async function cookieNames(context: BrowserContext) {
  return (await context.cookies()).map((c) => c.name);
}
