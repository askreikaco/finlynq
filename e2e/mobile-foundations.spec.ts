/**
 * Mobile-parity B1 (foundations): at 390px every (app) page has a 28/800 title, no page-level
 * horizontal scroll, >=44px Buttons; at 1280px the desktop header is unchanged. Also writes the
 * before/after screenshots used for the desktop-unchanged pixel diff:
 *   MOB1_SHOT_DIR=/tmp/.../mob1-shots MOB1_TAG=before|after npx playwright test -c playwright.mobile.config.ts -g screenshots
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TestUser, BASE_URL } from "./family-helpers";

const SHOT_DIR = process.env.MOB1_SHOT_DIR || path.join("test-results", "mob1-shots");
const TAG = process.env.MOB1_TAG || "after";

const ROUTES = [
  "/dashboard", "/accounts", "/portfolio", "/transactions", "/budgets", "/goals", "/reports",
  "/settings/general", "/family", "/subscriptions", "/loans", "/import", "/fire",
];

let user: TestUser;
let accountId = 0;

// Chromium cannot emulate the notch: override the shared inset vars with iPhone 14 values.
const DECLINE = () => { try { localStorage.setItem("finlynq:analytics-consent", "declined"); } catch { /* ignore */ } };
const INSET_CSS = ":root{--sat:47px;--sab:34px;--sal:0px;--sar:0px}";

test.setTimeout(600_000);
test.beforeAll(async () => {
  user = await TestUser.register("mob");
  const cash = await user.createAccount("Cash", { group: "Cash", currency: "VND" });
  const tcb = await user.createAccount("TCB", { group: "Cash", currency: "VND" });
  accountId = tcb;
  await user.createAccount("HSBC Platinum Credit Card *0862", { type: "L", group: "Credit Card", currency: "VND" });
  const eat = await user.createCategory("Eating Out", "E", "Essentials");
  const groc = await user.createCategory("Grocery", "E", "Essentials");
  const sal = await user.createCategory("Salary", "I", "Income");
  const d = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const tx = (a: number, c: number, amount: number, payee: string, n: number) =>
    user.addTransaction(a, c, amount, { currency: "VND", payee, date: d(n) });
  await tx(tcb, sal, 45_000_000, "ACME Co salary", 20);
  await tx(tcb, eat, -70_000, "COM TAM", 1);
  await tx(cash, groc, -1_250_000, "Co.opmart Supermarket", 2);
  await tx(tcb, eat, -380_000, "Highlands Coffee Vincom Center", 4);
  const mon = new Date().toISOString().slice(0, 7);
  await user.post("/api/budgets", { categoryId: eat, month: mon, amount: 500_000 });
  await user.post("/api/goals", { name: "Emergency fund", type: "savings", targetAmount: 200_000_000, deadline: "2027-06-30", accountId: tcb });
  // One investment holding so /portfolio renders its header (the empty state has no title).
  const brk = (await (await user.post("/api/accounts", { name: "TCBS Stocks", type: "A", group: "Investments", currency: "VND", isInvestment: true })).json()).id;
  await user.post("/api/portfolio", { name: "PVS", symbol: "PVS.VN", accountId: brk, currency: "VND" });
  await user.post("/api/transactions", { date: d(30), accountId: brk, categoryId: eat, amount: -10_000_000, currency: "VND", payee: "Buy PVS", quantity: 300, portfolioHolding: "PVS" });
  await user.put("/api/settings/dev-mode", { devMode: true }); // /fire, /scenarios, /tax are dev-mode pages
  await user.post("/api/onboarding/complete");
  await user.put("/api/settings/display-currency", { displayCurrency: "VND" });
});
test.afterAll(async () => { await user?.dispose(); });

// MOB1_STATE_FILE: pin the signed-in user across a baseline run and a changed run (same DB, same
// MOB_E2E_SECRET_SEED) so before/after screenshots show identical data and can be pixel-diffed.
async function sessionState() {
  const f = process.env.MOB1_STATE_FILE;
  if (f && existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const st = await user.ctx.storageState();
  if (f) writeFileSync(f, JSON.stringify(st));
  return st;
}

async function openPage(browser: import("@playwright/test").Browser, width: number, height: number, mobile: boolean) {
  const state = await sessionState();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: "dark",
    storageState: state,
    baseURL: BASE_URL,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}";
      document.head.appendChild(st);
    });
  });
  return { ctx, page };
}

async function settle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => {
    const m = document.querySelector("main");
    return !!m && m.innerText.length > 40 && !m.querySelector(".animate-pulse");
  }, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

test("screenshots: dashboard/accounts/transactions at 390 and 1280", async ({ browser }) => {
  mkdirSync(SHOT_DIR, { recursive: true });
  for (const [w, h, mobile] of [[390, 844, true], [1280, 800, false]] as const) {
    const { ctx, page } = await openPage(browser, w, h, mobile);
    for (const [name, url] of [["dashboard", "/dashboard"], ["accounts", "/accounts"], ["transactions", "/transactions"]]) {
      await settle(page, url);
      await page.screenshot({ path: path.join(SHOT_DIR, `${TAG}-${name}-${w}.png`) });
    }
    await ctx.close();
  }
  // Bottom tab bar (390).
  const { ctx, page } = await openPage(browser, 390, 844, true);
  await settle(page, "/accounts");
  await page.screenshot({ path: path.join(SHOT_DIR, `${TAG}-tabbar-390.png`), clip: { x: 0, y: 844 - 120, width: 390, height: 120 } });
  await ctx.close();
});

test("390px: every page has a 28/800 title, no horizontal scroll, no clipped header", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, 390, 844, true);
  const failures: string[] = [];
  for (const url of [...ROUTES, `/accounts/${accountId}`]) {
    await settle(page, url);
    const m = await page.evaluate(() => {
      const h1 = document.querySelector("main h1") as HTMLElement | null;
      const cs = h1 ? getComputedStyle(h1) : null;
      const r = h1?.getBoundingClientRect();
      return {
        sw: document.documentElement.scrollWidth,
        h1: !!h1, fs: cs?.fontSize, fw: cs?.fontWeight, right: r?.right ?? 0, h: r?.height ?? 0,
      };
    });
    if (m.sw > 390) failures.push(`${url}: scrollWidth ${m.sw}`);
    if (!m.h1) failures.push(`${url}: no h1`);
    else {
      if (m.fs !== "28px") failures.push(`${url}: h1 font-size ${m.fs}`);
      if (m.fw !== "800") failures.push(`${url}: h1 weight ${m.fw}`);
      if (m.right > 390) failures.push(`${url}: h1 overflows (${m.right})`);
      if (m.h > 80) failures.push(`${url}: h1 too tall (${m.h})`);
    }
  }
  await ctx.close();
  expect(failures).toEqual([]);
});

test("390px: Buttons, Inputs and Selects are >=44px tall; tips banner collapsed", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, 390, 844, true);
  const small: string[] = [];
  for (const url of ["/accounts", "/transactions", "/budgets", "/goals"]) {
    await settle(page, url);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main [data-slot=button], main [data-slot=input], main [data-slot=select-trigger]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          // xs / icon-xs buttons (dense row actions) keep their box and extend the hit area instead.
          if (el.getAttribute("data-size")?.endsWith("xs")) return false;
          return r.height < 43.5;
        })
        .map((el) => `${el.getAttribute("data-slot")} ${Math.round(el.getBoundingClientRect().height)}px "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}"`),
    );
    small.push(...bad.map((b) => `${url}: ${b}`));
  }
  await ctx.close();
  expect(small).toEqual([]);
});

test("390px: onboarding tips banner is a compact one-liner (<=56px) and expands", async ({ browser }) => {
  const fresh = await TestUser.register("tips");
  const state = await fresh.ctx.storageState();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: state, baseURL: BASE_URL });
  const page = await ctx.newPage();
  await settle(page, "/accounts");
  const banner = page.getByTestId("onboarding-tips-compact");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  expect((await banner.boundingBox())!.height).toBeLessThanOrEqual(56);
  await banner.getByRole("button", { name: /tips/i }).click();
  await expect(page.getByText("Track all your money in one place")).toBeVisible();
  await ctx.close();
  await fresh.dispose();
});

test("1280px: desktop header unchanged (24px bold, subtitle visible, no mobile pill sizing)", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, 1280, 800, false);
  for (const [url, title] of [["/accounts", "Accounts"], ["/budgets", "Budgets"], ["/goals", "Financial Goals"]] as const) {
    await settle(page, url);
    const m = await page.evaluate(() => {
      const h1 = document.querySelector("main h1") as HTMLElement;
      const cs = getComputedStyle(h1);
      const sub = h1.parentElement!.querySelector("p") as HTMLElement | null;
      const btn = document.querySelector<HTMLElement>("main [data-slot=button]");
      return {
        text: h1.textContent, fs: cs.fontSize, fw: cs.fontWeight,
        subDisplay: sub ? getComputedStyle(sub).display : null,
        btnH: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
        sw: document.documentElement.scrollWidth,
      };
    });
    expect(m.text).toBe(title);
    expect(m.fs).toBe("24px");
    expect(m.fw).toBe("700");
    expect(m.subDisplay).toBe("block");
    expect(m.btnH).toBeLessThanOrEqual(36);
    expect(m.sw).toBeLessThanOrEqual(1280);
  }
  await ctx.close();
});


// ---- header: title left + ONE primary right, secondary actions in the overflow menu ----
const HEADER_PAGES: Array<[string, boolean]> = [
  ["/accounts", true], ["/transactions", true], ["/budgets", true], ["/goals", true], ["/portfolio", true],
  ["/subscriptions", true], ["/loans", true], ["/import", true], ["/reports", false], ["/dashboard", false],
  ["/settings/general", false],
];

test("390px: header buttons stay on screen, primary action visible, secondary actions in the ⋯ menu", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, 390, 844, true);
  const failures: string[] = [];
  for (const [url, hasPrimary] of HEADER_PAGES) {
    await settle(page, url);
    const m = await page.evaluate(() => {
      const h1 = document.querySelector("main h1") as HTMLElement;
      const wrap = (h1.closest("[data-slot=page-header]") ?? h1.parentElement) as HTMLElement;
      const els = [...wrap.querySelectorAll<HTMLElement>("button, a")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return els.map((e) => {
        const r = e.getBoundingClientRect();
        return { name: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30), right: Math.round(r.right), left: Math.round(r.left), h: Math.round(r.height), w: Math.round(r.width) };
      });
    });
    for (const b of m) {
      if (b.right > 390 || b.left < 0) failures.push(`${url}: "${b.name}" off-screen (${b.left}..${b.right})`);
      if (b.h < 43 || b.w < 43) failures.push(`${url}: "${b.name}" ${b.w}x${b.h} < 44`);
    }
    if (hasPrimary && m.filter((b) => b.name !== "More actions").length === 0) failures.push(`${url}: no visible primary action`);
    if (hasPrimary && m.length > 2) failures.push(`${url}: ${m.length} visible header controls (expected primary + ⋯): ${m.map((b) => b.name).join(", ")}`);
  }
  await ctx.close();
  expect(failures).toEqual([]);
});

test("390px: Accounts ⋯ menu lists Manage groups + Show archived", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, 390, 844, true);
  await settle(page, "/accounts");
  // Keyboard-open: a fixed "Unlock your data" banner (UnlockGate, pre-existing) can sit over the top row in dev.
  await page.getByRole("button", { name: "More actions" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Manage groups" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Show archived" })).toBeVisible();
  await ctx.close();
});

// ---- bottom tab bar (native: height 60 + inset, icon 22, label 11/600) ----
test("390px: bottom tab bar uses native sizes and content is not hidden behind it", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, 390, 844, true);
  await settle(page, "/accounts");
  await page.addStyleTag({ content: INSET_CSS });
  const m = await page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label='Mobile navigation']") as HTMLElement;
    const links = [...nav.querySelectorAll<HTMLElement>("a")];
    const main = document.querySelector("main") as HTMLElement;
    return {
      barH: Math.round(nav.getBoundingClientRect().height),
      icons: links.map((a) => Math.round(a.querySelector("svg")!.getBoundingClientRect().width)),
      font: links.map((a) => getComputedStyle(a).fontSize),
      weight: links.map((a) => getComputedStyle(a).fontWeight),
      right: Math.max(...links.map((a) => Math.round(a.getBoundingClientRect().right))),
      mainPad: parseFloat(getComputedStyle(main).paddingBottom),
    };
  });
  expect(m.barH).toBe(60 + 34); // 59 row + 1 border + inset = native 60 + inset
  expect(m.icons).toEqual([22, 22, 22, 22, 22]);
  expect(m.font).toEqual(Array(5).fill("11px"));
  expect(m.weight).toEqual(Array(5).fill("600"));
  expect(m.right).toBeLessThanOrEqual(390);
  expect(m.mainPad).toBe(60 + 34);
  await ctx.close();
});

test("320px: five tabs fit without clipping", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, 320, 640, true);
  await settle(page, "/accounts");
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("nav[aria-label='Mobile navigation'] a")]
      .filter((a) => a.scrollWidth > a.clientWidth + 1 || a.getBoundingClientRect().right > 320)
      .map((a) => a.textContent),
  );
  expect(bad).toEqual([]);
  await ctx.close();
});

// ---- /auth/forgot-password + /auth/reset-password: one screen, vertically centred ----
// (/cloud sign-in/sign-up/2FA is out of Batch 1 scope: another branch redesigns it.)
async function authPage(browser: import("@playwright/test").Browser, w: number, h: number, withInset: boolean) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: "dark", baseURL: BASE_URL });
  const page = await ctx.newPage();
  await page.addInitScript(DECLINE);
  if (withInset) await page.addInitScript((css) => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); }), INSET_CSS);
  return { ctx, page };
}
const fit = (page: Page) => page.evaluate(() => {
  const se = document.scrollingElement!;
  const blk = document.querySelector("[data-testid=auth-block]") as HTMLElement;
  // Content extent (the block itself may stretch): union of its children.
  const kids = [...blk.children].map((c) => c.getBoundingClientRect()).filter((k) => k.height > 0);
  const top0 = Math.min(...kids.map((k) => k.top));
  const bottom0 = Math.max(...kids.map((k) => k.bottom));
  const r = { top: top0, bottom: bottom0, height: bottom0 - top0 };
  const cs = getComputedStyle(document.documentElement);
  const root = document.documentElement;
  const sat = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  return { sh: se.scrollHeight, ih: window.innerHeight, center: r.top + r.height / 2, sat, bottom: r.bottom, top: r.top, sw: se.scrollWidth, cw: root.clientWidth, _: cs.length };
});

for (const [w, h, inset] of [[390, 844, true], [375, 667, false]] as const) {
  test(`${w}x${h}: /auth/forgot-password and /auth/reset-password fit one screen, centred`, async ({ browser }) => {
    const { ctx, page } = await authPage(browser, w, h, inset);
    for (const url of ["/auth/forgot-password", "/auth/reset-password"]) {
      await page.goto(url, { waitUntil: "networkidle" });
      const m = await fit(page);
      expect(m.sh, `${url} scrollHeight ${m.sh} > ${m.ih}`).toBeLessThanOrEqual(m.ih);
      expect(m.sw).toBeLessThanOrEqual(m.cw);
      if (inset) {
        const target = (47 + (h - 34)) / 2;
        expect(Math.abs(m.center - target), `${url} centre ${m.center} vs ${target}`).toBeLessThanOrEqual(40);
      }
      const back = await page.getByRole("link", { name: /Back to sign in/ }).boundingBox();
      expect(back!.y + back!.height).toBeLessThanOrEqual(h);
    }
    await ctx.close();
  });
}
