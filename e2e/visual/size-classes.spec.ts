/**
 * Manual visual + structural harness for the adaptive size-class work (Goal 2).
 *
 * Manual only: not in CI, not in vitest. Run with the commands in docs/design-system.md ("Visual harness").
 *
 * Matrix: 3 viewports (390x844 phone with isMobile+hasTouch, 768x1024, 1280x800) x 2 themes
 * (dark, light) x 9 pages. Each cell is one test: it writes a full-viewport PNG named
 * `<viewport>-<theme>-<page>.png` into FINLYNQ_VISUAL_OUT, then runs soft assertions.
 *
 * FINLYNQ_VISUAL_TARGET selects the assertion set:
 *   current (default): the invariants that hold on today's app (overflow, sticky header, tab bar at
 *                      390, FAB fixed, system font stack, no Google Fonts requests, theme class).
 *   goal2:             current + rail/bottom-bar switching by breakpoint and one-of-two view markers
 *                      on pages that show a ViewMode toggle.
 *
 * Contract selectors for goal2 (the Goal 2 packages must provide these):
 *   rail        [data-testid="app-rail"]
 *   bottom bar  nav[aria-label="Mobile navigation"]   (already present in src/components/nav.tsx)
 *   view toggle [data-testid="view-mode-toggle"] or [aria-label="View"] (ViewModeToggle); DataView wraps the mounted body in data-view="list"|"cards"
 *
 * Seeding goes through the app's HTTP API. The one out-of-band step is marking the throwaway user's
 * email verified (and promoting nothing), done with SQL on FINLYNQ_VISUAL_DATABASE_URL, which must be a
 * *_test database. Passwords and the user tag are random per run, kept in memory, never printed.
 */
import { test, expect, request, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";

const BASE = process.env.FINLYNQ_VISUAL_BASE_URL ?? "";
const DB_URL = process.env.FINLYNQ_VISUAL_DATABASE_URL ?? "";
const TARGET = process.env.FINLYNQ_VISUAL_TARGET ?? "current";
const OUT = path.resolve(process.cwd(), process.env.FINLYNQ_VISUAL_OUT ?? "test-results/visual");
const ROWS = Number(process.env.FINLYNQ_VISUAL_ROWS ?? 130);

const RAIL_SEL = '[data-testid="app-rail"]';
const BOTTOM_SEL = 'nav[aria-label="Mobile navigation"]';
const FAB_SEL = '[data-testid="page-fab"]';
const TOGGLE_SEL = '[data-testid="view-mode-toggle"], [aria-label="View"]'; // ViewModeToggle (src/components/adaptive/view-mode.tsx) has aria-label="View"
const VIEW_SEL = '[data-view="cards"],[data-view="list"]';
// First token of a system font stack (the default --font-ui is ui-sans-serif, system-ui, ...).
const SYSTEM_FIRST = ["ui-sans-serif", "system-ui", "-apple-system", "blinkmacsystemfont", "sans-serif", "ui-rounded", "ui-serif"];

if (TARGET !== "current" && TARGET !== "goal2") throw new Error("FINLYNQ_VISUAL_TARGET must be current or goal2");

const VIEWPORTS = [
  { name: "390x844", w: 390, h: 844, mobile: true, dpr: 2 },
  { name: "768x1024", w: 768, h: 1024, mobile: false, dpr: 1 },
  { name: "1280x800", w: 1280, h: 800, mobile: false, dpr: 1 },
] as const;
const THEMES = ["dark", "light"] as const;
type PageDef = { name: string; path: (ids: Seeded) => string; fullScreen?: boolean };
const PAGES: PageDef[] = [
  { name: "dashboard", path: () => "/dashboard" },
  { name: "transactions", path: () => "/transactions" },
  { name: "accounts", path: () => "/accounts" },
  { name: "account-detail", path: (s) => `/accounts/${s.accountId}` },
  { name: "portfolio", path: () => "/portfolio" },
  { name: "budgets", path: () => "/budgets" },
  { name: "settings", path: () => "/settings" },
  { name: "more", path: () => "/more" },
  { name: "transactions-new", path: () => "/transactions/new", fullScreen: true },
];

type Seeded = { accountId: number; storage: Awaited<ReturnType<APIRequestContext["storageState"]>> };
let seeded: Seeded;
let db: pg.Client;
let user: { ctx: APIRequestContext; h: Record<string, string>; id: string };
let seq = 0;
const nextIp = () => `10.78.${Math.floor(seq / 250) % 250}.${(seq++ % 250) + 1}`;
const PW = randomBytes(18).toString("hex") + "Aa1!";
const manifest: Array<Record<string, unknown>> = [];

async function api(m: "get" | "post" | "put", p: string, data?: unknown) {
  const r = await user.ctx[m](p, { headers: user.h, ...(data === undefined ? {} : { data }) });
  return r;
}

test.beforeAll(async () => {
  if (!BASE) throw new Error("Set FINLYNQ_VISUAL_BASE_URL (running app, e.g. http://localhost:3940)");
  if (!/\/[^/]*_test([?#]|$)/.test(DB_URL)) throw new Error("Set FINLYNQ_VISUAL_DATABASE_URL to a *_test database");
  mkdirSync(OUT, { recursive: true });
  db = new pg.Client({ connectionString: DB_URL });
  await db.connect();

  // Unique per worker incarnation: randomBytes is pinned by fixed-clock.cjs, so a random-bytes tag would repeat
  // after a worker restart and collide (409) with the user the earlier cell left behind. Math.random is not pinned.
  const tag = "vis" + Math.random().toString(36).slice(2, 10) + process.pid.toString(36);
  user = { ctx: await request.newContext({ baseURL: BASE }), h: { origin: BASE, "x-forwarded-for": nextIp() }, id: "" };
  const reg = await api("post", "/api/auth/register", { username: tag, email: `${tag}@visual.test`, password: PW, displayName: tag });
  if (reg.status() !== 201) throw new Error(`register failed: ${reg.status()} (tag ${tag})`);
  user.id = String((await reg.json()).userId);
  await db.query("update users set email_verified = 1 where id = $1", [user.id]);
  const login = await api("post", "/api/auth/login", { identifier: tag, password: PW, trustDevice: false });
  if (!login.ok()) throw new Error(`login failed: ${login.status()}`);

  const mk = async (name: string, type: string, group: string, extra: Record<string, unknown> = {}) => {
    const r = await api("post", "/api/accounts", { name, type, group, currency: "VND", ...extra });
    if (r.status() !== 201) throw new Error(`account ${name}: ${r.status()}`);
    return (await r.json()).id as number;
  };
  const cash = await mk("Cash", "A", "Cash");
  const tcb = await mk("TCB", "A", "Cash");
  const momo = await mk("MoMo Wallet", "A", "Cash");
  const card = await mk("HSBC Platinum Credit Card *0862", "L", "Credit Card");
  const cat = async (name: string, type: string, group: string) => (await (await api("post", "/api/categories", { name, type, group })).json()).id as number;
  const eat = await cat("Eating Out", "E", "Essentials");
  const groc = await cat("Grocery", "E", "Essentials");
  const trans = await cat("Transport", "E", "Essentials");
  const util = await cat("Utilities", "E", "Bills");
  const sal = await cat("Salary", "I", "Income");
  const payees = ["COM TAM", "Highlands Coffee Vincom", "Co.opmart Supermarket", "Grab ride", "Electric EVN", "Circle K", "Bun cha Hanoi", "Winmart"];
  const accts = [cash, tcb, momo, card];
  for (let n = 0; n < ROWS; n++) {
    const date = new Date(Date.now() - (n % 90) * 864e5 - n * 3e5).toISOString().slice(0, 10);
    const pick = n % 7 === 0
      ? { c: sal, amt: 45_000_000, p: "ACME Co salary", a: tcb }
      : { c: [eat, groc, trans, util][n % 4], amt: -(40_000 + ((n * 9173) % 900_000)), p: payees[n % payees.length], a: accts[n % accts.length] };
    const r = await api("post", "/api/transactions", { date, accountId: pick.a, categoryId: pick.c, amount: pick.amt, currency: "VND", payee: pick.p });
    if (!r.ok()) throw new Error(`transaction ${n}: ${r.status()}`);
  }
  const brk = (await (await api("post", "/api/accounts", { name: "TCBS Stocks", type: "A", group: "Investments", currency: "VND", isInvestment: true })).json()).id as number;
  for (const sym of ["PVS", "VCB", "FPT"]) {
    await api("post", "/api/portfolio", { name: sym, symbol: `${sym}.VN`, accountId: brk, currency: "VND" });
    await api("post", "/api/transactions", { date: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), accountId: brk, categoryId: eat, amount: -10_000_000, currency: "VND", payee: `Buy ${sym}`, quantity: 300, portfolioHolding: sym });
  }
  await api("post", "/api/budgets", { categoryId: eat, month: new Date().toISOString().slice(0, 7), amount: 500_000 });
  await api("put", "/api/settings/dev-mode", { devMode: true });
  await api("post", "/api/onboarding/complete");
  await api("put", "/api/settings/display-currency", { displayCurrency: "VND" });

  seeded = { accountId: tcb, storage: await user.ctx.storageState() };
  manifest.push({ seeded: { transactions: ROWS, accounts: 6 } });
});

test.afterAll(async () => {
  await user?.ctx.dispose();
  await db?.end().catch(() => {});
  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ target: TARGET, base: BASE, shots: manifest }, null, 2));
});

// Runs inside the page. Keep it pure: no mutation, returns plain data.
function measure(sel: { rail: string; bottom: string; fab: string; toggle: string; view: string }) {
  const vw = window.innerWidth;
  const box = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      top: Math.round(r.top * 10) / 10, left: Math.round(r.left), right: Math.round(r.right),
      w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, visibility: cs.visibility, position: cs.position,
      visible: r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden",
    };
  };
  const header = document.querySelector('[data-slot="page-header"]');
  const hb = box(header);
  const fab = document.querySelector(sel.fab);
  const fb = box(fab);
  return {
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    vw,
    scrollRange: document.documentElement.scrollHeight - window.innerHeight,
    fontFamily: getComputedStyle(document.body).fontFamily,
    htmlClass: document.documentElement.className,
    bottom: box(document.querySelector(sel.bottom)),
    rail: box(document.querySelector(sel.rail)),
    header: hb ? { ...hb, sticky: hb.position === "sticky", cssTop: parseFloat(getComputedStyle(header as Element).top) || 0 } : null,
    fab: fb ? { ...fb, inViewport: fb.top >= 0 && fb.top < window.innerHeight && fb.right <= vw + 1 && fb.left >= -1 } : null,
    toggleCount: document.querySelectorAll(sel.toggle).length,
    viewMarkers: document.querySelectorAll(sel.view).length,
  };
}
type Measure = ReturnType<typeof measure>;

async function settle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => {
    const m = document.querySelector("main");
    return !!m && m.innerText.length > 40 && !m.querySelector(".animate-pulse");
  }, null, { timeout: 180_000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const pg_ of PAGES) {
      test(`${vp.name} ${theme} ${pg_.name}`, async ({ browser }: { browser: Browser }) => {
        const ctx = await browser.newContext({
          baseURL: BASE,
          viewport: { width: vp.w, height: vp.h },
          deviceScaleFactor: vp.dpr,
          isMobile: vp.mobile,
          hasTouch: vp.mobile,
          colorScheme: theme,
          storageState: seeded.storage,
        });
        try {
          const page = await ctx.newPage();
          await page.addInitScript((t: string) => {
            try {
              localStorage.setItem("finlynq:analytics-consent", "declined");
              localStorage.setItem("theme", t);
            } catch { /* storage blocked: the page still renders */ }
            document.addEventListener("DOMContentLoaded", () => {
              const st = document.createElement("style");
              st.textContent = "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}";
              document.head.appendChild(st);
            });
          }, theme);
          const hosts = new Set<string>();
          page.on("request", (r) => { try { hosts.add(new URL(r.url()).hostname); } catch { /* ignore */ } });

          await settle(page, pg_.path(seeded));
          const shot = path.join(OUT, `${vp.name}-${theme}-${pg_.name}.png`);
          await page.screenshot({ path: shot, fullPage: false });

          // Bounded probe: a missing rail/bar/toggle costs at most 15 s, then the cell records it as a failed assertion.
          await Promise.all([RAIL_SEL, BOTTOM_SEL, TOGGLE_SEL].map((s) => page.waitForSelector(s, { state: "attached", timeout: 15_000 }).catch(() => null)));
          const top: Measure = await page.evaluate(measure, { rail: RAIL_SEL, bottom: BOTTOM_SEL, fab: FAB_SEL, toggle: TOGGLE_SEL, view: VIEW_SEL });
          let scrolled: Measure | null = null;
          if (top.scrollRange >= 1) {
            // A page only a few px taller than the viewport (e.g. /accounts with the seeded data: range 5 at 768) cannot
            // scroll past the header's natural offset (~32px), so the pin would be unobservable and the check would
            // measure the page length. Add a spacer after the screenshot so the sticky check has room to scroll.
            if (top.scrollRange < 600) {
              await page.evaluate(() => {
                const s = document.createElement("div");
                s.setAttribute("data-visual-spacer", "");
                s.style.height = "1000px";
                document.querySelector("main")?.appendChild(s);
              });
            }
            // html is scroll-behavior: smooth, so a bare scrollTo + fixed wait samples mid-animation on a busy
            // runner (header top = natural offset minus the partial scroll). Jump instantly, then wait for the target.
            const target = await page.evaluate(() => {
              document.documentElement.style.scrollBehavior = "auto";
              const y = Math.min(600, document.documentElement.scrollHeight - window.innerHeight);
              window.scrollTo(0, y);
              return y;
            });
            await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 1, target, { timeout: 5_000 }).catch(() => {});
            await page.waitForTimeout(100);
            scrolled = await page.evaluate(measure, { rail: RAIL_SEL, bottom: BOTTOM_SEL, fab: FAB_SEL, toggle: TOGGLE_SEL, view: VIEW_SEL });
          }
          manifest.push({ shot: path.basename(shot), scrollW: top.scrollW, clientW: top.clientW, scrollRange: top.scrollRange, fontFamily: top.fontFamily.slice(0, 60) });

          // ---- current: invariants that hold today ----
          expect.soft(top.scrollW <= top.clientW, `horizontal overflow ${top.scrollW} > ${top.clientW}`).toBe(true);
          const htmlDark = /(^|\s)dark(\s|$)/.test(top.htmlClass);
          expect.soft(htmlDark, `html class "${top.htmlClass}" does not match theme ${theme}`).toBe(theme === "dark");
          const firstFamily = top.fontFamily.split(",")[0].trim().replace(/["']/g, "").toLowerCase();
          expect.soft(SYSTEM_FIRST.includes(firstFamily), `body font-family starts with "${firstFamily}", not a system stack`).toBe(true);
          const webFonts = [...hosts].filter((h) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(h));
          expect.soft(webFonts, `requests to web font hosts: ${webFonts.join(",")}`).toEqual([]);

          // Full-screen entry routes (FULL_SCREEN_ENTRY_ROUTES in src/components/nav.tsx) hide the tab bar on purpose.
          const tabBarExpected = !pg_.fullScreen;
          if (vp.w === 390) {
            expect.soft(top.bottom?.visible ?? false, `tab bar (Mobile navigation) visible at 390 must be ${tabBarExpected}`).toBe(tabBarExpected);
          }
          if (top.fab) {
            expect.soft(top.fab.position, "page FAB must be position: fixed").toBe("fixed");
            expect.soft(top.fab.inViewport, "page FAB must sit inside the viewport").toBe(true);
          }
          if (scrolled?.header) {
            expect.soft(scrolled.header.sticky, "page header must be position: sticky").toBe(true);
            expect.soft(Math.abs(scrolled.header.top - scrolled.header.cssTop) <= 1, `page header top ${scrolled.header.top} after scroll, expected ${scrolled.header.cssTop}`).toBe(true);
          }

          // ---- goal2: target architecture ----
          if (TARGET === "goal2") {
            if (vp.w === 390) {
              expect.soft(top.bottom?.visible ?? false, "goal2: bottom bar visible at 390 (except full-screen entry routes)").toBe(tabBarExpected);
              expect.soft(top.rail?.visible ?? false, "goal2: rail hidden at 390").toBe(false);
            } else {
              expect.soft(top.rail?.visible ?? false, `goal2: rail visible at ${vp.w}`).toBe(true);
              expect.soft(top.bottom?.visible ?? false, `goal2: bottom bar hidden at ${vp.w}`).toBe(false);
            }
            if (top.toggleCount > 0) {
              expect.soft(top.viewMarkers, "goal2: exactly one of data-view=cards|list mounted").toBe(1);
            }
          }
        } finally {
          await ctx.close();
        }
      });
    }
  }
}
