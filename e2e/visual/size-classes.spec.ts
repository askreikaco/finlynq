/**
 * Manual visual + structural harness for the adaptive size-class work (Goal 2).
 *
 * Manual only: not in CI, not in vitest. Run with the commands in docs/design-system.md ("Visual harness").
 *
 * Matrix: 3 viewports (390x844 phone with isMobile+hasTouch, 768x1024, 1280x800) x 2 themes
 * (dark, light) x the PAGES list. Each cell is one test: it writes a full-viewport PNG named
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
 * Selection (all optional; unset = today's full matrix, viewport-only shots):
 *   FINLYNQ_VISUAL_PAGES      comma list of PAGES names (unknown name = load error)
 *   FINLYNQ_VISUAL_VIEWPORTS  comma list of 390x844,768x1024,1280x800
 *   FINLYNQ_VISUAL_FULLPAGE=1 full-page screenshots instead of viewport-only
 *   FINLYNQ_VISUAL_TAG        fixed user tag. Login first; if it works the earlier seeded user is reused (same
 *                             ids and data across base and candidate runs). Otherwise register + seed once.
 *                             Password is derived from the tag, so the same tag always logs in.
 *   FINLYNQ_VISUAL_ADMIN=1    SQL-promote the seeded user to role admin (needed for /admin pages).
 *
 * Seeding goes through the app's HTTP API. Out-of-band SQL on FINLYNQ_VISUAL_DATABASE_URL, which must be a
 * *_test database: mark the seeded user verified, optionally promote to admin, and read back ids
 * (encrypted names cannot be queried, so ids come from list endpoints or from amount/link_id).
 * Random-tag passwords are random per run, kept in memory, never printed.
 */
import { test, expect, request, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";

const BASE = process.env.FINLYNQ_VISUAL_BASE_URL ?? "";
const DB_URL = process.env.FINLYNQ_VISUAL_DATABASE_URL ?? "";
const TARGET = process.env.FINLYNQ_VISUAL_TARGET ?? "current";
const OUT = path.resolve(process.cwd(), process.env.FINLYNQ_VISUAL_OUT ?? "test-results/visual");
const ROWS = Number(process.env.FINLYNQ_VISUAL_ROWS ?? 130);
const FIXED_TAG = (process.env.FINLYNQ_VISUAL_TAG ?? "").trim();
const ADMIN = process.env.FINLYNQ_VISUAL_ADMIN === "1";
const FULL_PAGE = process.env.FINLYNQ_VISUAL_FULLPAGE === "1";

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
// fullScreen mirrors FULL_SCREEN_ENTRY_ROUTES / FULL_SCREEN_EDIT_ROUTE / FULL_SCREEN_ENTRY_PATTERNS in
// src/components/nav.tsx: the bottom bar is hidden on these routes at 390.
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
  { name: "goals", path: () => "/goals" },
  { name: "goals-new", path: () => "/goals/new", fullScreen: true },
  { name: "goal-edit", path: (s) => `/goals/${s.goalId}/edit`, fullScreen: true },
  { name: "loans", path: () => "/loans" },
  { name: "loans-new", path: () => "/loans/new", fullScreen: true },
  { name: "subscriptions", path: () => "/subscriptions" },
  { name: "subscriptions-new", path: () => "/subscriptions/new", fullScreen: true },
  { name: "budgets-new", path: () => "/budgets/new", fullScreen: true },
  { name: "categories", path: () => "/categories" },
  { name: "category-new", path: () => "/categories/new", fullScreen: true },
  { name: "rules-new", path: () => "/settings/rules/new", fullScreen: true },
  { name: "investments", path: () => "/settings/investments" },
  { name: "security-new", path: () => "/settings/investments/securities/new", fullScreen: true },
  { name: "portfolio-new", path: () => "/portfolio/new" },
  { name: "portfolio-buy", path: () => "/portfolio/new/buy", fullScreen: true },
  { name: "tx-edit", path: (s) => `/transactions/${s.txId}/edit`, fullScreen: true },
  { name: "settings-general", path: () => "/settings/general" },
  { name: "reports", path: () => "/reports" },
  { name: "tax", path: () => "/tax" },
  { name: "realized-gains", path: () => "/portfolio/realized-gains" },
  // Seed-backed edit/detail pages (ids from Seeded, see beforeAll).
  { name: "loan-edit", path: (s) => `/loans/${s.loanId}/edit`, fullScreen: true },
  { name: "subscription-edit", path: (s) => `/subscriptions/${s.subId}/edit`, fullScreen: true },
  { name: "budgets-move-money", path: () => "/budgets/move-money", fullScreen: true },
  { name: "budgets-template-new", path: () => "/budgets/templates/new", fullScreen: true },
  { name: "budgets-template-apply", path: () => "/budgets/templates/apply" },
  { name: "accounts-new", path: () => "/accounts/new", fullScreen: true },
  { name: "accounts-groups", path: () => "/accounts/groups" },
  { name: "category-edit", path: (s) => `/categories/${s.categoryId}/edit`, fullScreen: true },
  { name: "rule-edit", path: (s) => `/settings/rules/${s.ruleId}/edit`, fullScreen: true },
  { name: "cash-sleeve-new", path: () => "/settings/investments/cash-sleeves/new", fullScreen: true },
  { name: "security-edit", path: (s) => `/settings/investments/securities/${s.securityId}/edit`, fullScreen: true },
  { name: "security-prices", path: (s) => `/settings/investments/securities/${s.securityId}/prices`, fullScreen: true },
  { name: "security-link", path: (s) => `/settings/investments/securities/${s.securityId}/link`, fullScreen: true },
  { name: "account-link", path: (s) => `/settings/investments/accounts/${s.investAccountId}/link`, fullScreen: true },
  { name: "tx-split", path: (s) => `/transactions/${s.splitTxId}/split`, fullScreen: true },
  { name: "transfer-edit", path: (s) => `/transactions/transfer/${s.linkId}/edit`, fullScreen: true },
  { name: "settings-developer", path: () => "/settings/developer" },
  { name: "settings-integrations", path: () => "/settings/integrations" },
  { name: "settings-reconciliation", path: () => "/settings/reconciliation" },
  { name: "settings-about", path: () => "/settings/about" },
  { name: "settings-backfill", path: () => "/settings/backfill" },
  { name: "settings-reconcile-visibility", path: () => "/settings/import/reconcile-visibility" },
  { name: "settings-categorization", path: () => "/settings/categorization" },
  // Admin pages: need FINLYNQ_VISUAL_ADMIN=1.
  { name: "admin-api-log", path: () => "/admin/api-log" },
  { name: "admin-diagnostics", path: () => "/admin/diagnostics" },
  { name: "admin-email-inbox", path: () => "/admin/email-inbox" },
  { name: "admin-inbox", path: () => "/admin/inbox" },
  { name: "admin-announcements", path: () => "/admin/announcements" },
  { name: "admin-system", path: () => "/admin/system" },
  { name: "admin-price-cache", path: () => "/admin/price-cache" },
  { name: "admin-integrations", path: () => "/admin/integrations" },
  { name: "admin-instance", path: () => "/admin/instance" },
  { name: "admin-feedback", path: () => "/admin/feedback" },
  { name: "family", path: () => "/family" },
  { name: "family-share", path: () => "/family/share" },
  { name: "family-accept", path: () => "/family/accept" },
  { name: "whats-new", path: () => "/whats-new" },
  { name: "feedback", path: () => "/feedback" },
  { name: "api-docs", path: () => "/api-docs" },
  { name: "fire", path: () => "/fire" },
  { name: "tx-audit", path: () => "/transactions/audit" },
  { name: "dividends", path: () => "/portfolio/dividends" },
];

// Keep only the names listed in an env var (comma list), in PAGES/VIEWPORTS order. Unset = all.
// An unknown name throws at module load, so a typo fails the --list run instead of silently skipping cells.
function pick<T extends { name: string }>(all: readonly T[], envName: string, kind: string): T[] {
  const raw = (process.env[envName] ?? "").trim();
  if (!raw) return [...all];
  const want = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = want.filter((w) => !all.some((a) => a.name === w));
  if (unknown.length) throw new Error(`${envName}: unknown ${kind} ${unknown.join(", ")}`);
  return all.filter((a) => want.includes(a.name));
}
const SELECTED_VIEWPORTS = pick(VIEWPORTS, "FINLYNQ_VISUAL_VIEWPORTS", "viewport");
const SELECTED_PAGES = pick(PAGES, "FINLYNQ_VISUAL_PAGES", "page");

type Seeded = {
  accountId: number;
  goalId: number;
  txId: number;
  categoryId: number;
  investAccountId: number;
  loanId: number;
  subId: number;
  ruleId: number;
  securityId: number;
  splitTxId: number;
  linkId: string;
  storage: Awaited<ReturnType<APIRequestContext["storageState"]>>;
};
let seeded: Seeded;
let db: pg.Client;
let user: { ctx: APIRequestContext; h: Record<string, string>; id: string };
let seq = 0;
const nextIp = () => `10.78.${Math.floor(seq / 250) % 250}.${(seq++ % 250) + 1}`;
// Fixed tag: deterministic password (throwaway *_test user only) so a later run can log in again.
const PW = FIXED_TAG
  ? "Vis" + createHash("sha256").update("finlynq-visual:" + FIXED_TAG).digest("hex").slice(0, 32) + "Aa1!"
  : randomBytes(18).toString("hex") + "Aa1!";
const manifest: Array<Record<string, unknown>> = [];

async function api(m: "get" | "post" | "put", p: string, data?: unknown) {
  const r = await user.ctx[m](p, { headers: user.h, ...(data === undefined ? {} : { data }) });
  return r;
}

// Ids for the PAGES paths. Names are encrypted at rest, so list endpoints (which return decrypted names) are
// matched by name. Transactions and the transfer link are read with SQL on values the seed sets (amount, link_id).
async function resolveIds(userId: string): Promise<Omit<Seeded, "storage">> {
  const list = async (p: string): Promise<Array<Record<string, unknown>>> => {
    const r = await api("get", p);
    if (!r.ok()) throw new Error(`GET ${p}: ${r.status()}`);
    const j = (await r.json()) as unknown;
    if (Array.isArray(j)) return j as Array<Record<string, unknown>>;
    const o = j as Record<string, unknown>;
    const inner = o.data ?? o;
    if (Array.isArray(inner)) return inner as Array<Record<string, unknown>>;
    const firstArray = Object.values(inner as Record<string, unknown>).find((v) => Array.isArray(v));
    if (!firstArray) throw new Error(`GET ${p}: no array in response`);
    return firstArray as Array<Record<string, unknown>>;
  };
  const byName = (rows: Array<Record<string, unknown>>, key: string, value: string): number => {
    const hit = rows.find((row) => row[key] === value);
    if (!hit) throw new Error(`visual seed: "${value}" not found`);
    return Number(hit.id);
  };
  const one = async (sql: string, args: unknown[]): Promise<unknown> => {
    const q = await db.query(sql, args);
    if (q.rows.length === 0) throw new Error(`visual seed: no row for ${sql.slice(0, 48)}`);
    return Object.values(q.rows[0])[0];
  };
  const accounts = await list("/api/accounts");
  return {
    accountId: byName(accounts, "name", "TCB"),
    investAccountId: byName(accounts, "name", "TCBS Stocks"),
    goalId: byName(await list("/api/goals"), "name", "Emergency fund"),
    categoryId: byName(await list("/api/categories"), "name", "Grocery"),
    loanId: byName(await list("/api/loans"), "name", "Car loan"),
    subId: byName(await list("/api/subscriptions"), "name", "Netflix"),
    ruleId: byName(await list("/api/rules"), "name", "Visual rule"),
    securityId: byName(await list("/api/securities"), "symbol", "VNM"),
    txId: Number(await one("select id from transactions where user_id = $1 and amount = 45000000 and link_id is null order by id limit 1", [userId])),
    splitTxId: Number(await one("select id from transactions where user_id = $1 and amount = -1234567 order by id limit 1", [userId])),
    linkId: String(await one("select link_id from transactions where user_id = $1 and link_id is not null order by id limit 1", [userId])),
  };
}

test.beforeAll(async () => {
  if (!BASE) throw new Error("Set FINLYNQ_VISUAL_BASE_URL (running app, e.g. http://localhost:3940)");
  if (!/\/[^/]*_test([?#]|$)/.test(DB_URL)) throw new Error("Set FINLYNQ_VISUAL_DATABASE_URL to a *_test database");
  mkdirSync(OUT, { recursive: true });
  db = new pg.Client({ connectionString: DB_URL });
  await db.connect();

  // Random tag: unique per worker incarnation. randomBytes is pinned by fixed-clock.cjs, so a random-bytes tag would
  // repeat after a worker restart and collide (409) with the user the earlier cell left behind. Math.random is not pinned.
  // Fixed tag (FINLYNQ_VISUAL_TAG): the same user every run.
  const tag = FIXED_TAG || "vis" + Math.random().toString(36).slice(2, 10) + process.pid.toString(36);
  user = { ctx: await request.newContext({ baseURL: BASE }), h: { origin: BASE, "x-forwarded-for": nextIp() }, id: "" };

  // Fixed tag: a working login means an earlier run already seeded this user. Reuse it as is.
  let reused = false;
  if (FIXED_TAG && (await api("post", "/api/auth/login", { identifier: tag, password: PW, trustDevice: false })).ok()) {
    reused = true;
    const q = await db.query("select id from users where username = $1", [tag]);
    if (q.rows.length === 0) throw new Error("visual: fixed tag logs in but no users row matches it");
    user.id = String(q.rows[0].id);
  } else {
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
    const goal = await api("post", "/api/goals", { name: "Emergency fund", type: "savings", targetAmount: 50_000_000, currency: "VND" });
    if (goal.status() !== 201) throw new Error(`goal: ${goal.status()}`);
    const brk = (await (await api("post", "/api/accounts", { name: "TCBS Stocks", type: "A", group: "Investments", currency: "VND", isInvestment: true })).json()).id as number;
    for (const sym of ["PVS", "VCB", "FPT"]) {
      await api("post", "/api/portfolio", { name: sym, symbol: `${sym}.VN`, accountId: brk, currency: "VND" });
      await api("post", "/api/transactions", { date: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), accountId: brk, categoryId: eat, amount: -10_000_000, currency: "VND", payee: `Buy ${sym}`, quantity: 300, portfolioHolding: sym });
    }
    await api("post", "/api/budgets", { categoryId: eat, month: new Date().toISOString().slice(0, 7), amount: 500_000 });
    await api("put", "/api/settings/dev-mode", { devMode: true });
    await api("post", "/api/onboarding/complete");
    await api("put", "/api/settings/display-currency", { displayCurrency: "VND" });

    // Seed additions for the edit/detail pages in PAGES. Each call must succeed: a silent miss would make its page
    // render the not-found state and the shot would look like a real page.
    const today = new Date().toISOString().slice(0, 10);
    const dayFromNow = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    const must = (r: { ok(): boolean; status(): number }, what: string) => {
      if (!r.ok()) throw new Error(`${what}: ${r.status()}`);
    };
    must(await api("post", "/api/loans", { name: "Car loan", type: "loan", principal: 200_000_000, annualRate: 8.5, termMonths: 60, startDate: dayFromNow(-365), currency: "VND", accountId: tcb }), "loan");
    must(await api("post", "/api/subscriptions", { name: "Netflix", amount: -260_000, currency: "VND", frequency: "monthly", categoryId: eat, accountId: card, nextDate: dayFromNow(7), status: "active" }), "subscription");
    must(await api("post", "/api/budget-templates", { name: "Visual template", categoryId: groc, amount: 3_000_000 }), "budget template");
    must(await api("post", "/api/rules", { name: "Visual rule", conditions: { all: [{ field: "payee", op: "contains", value: "Grab" }] }, actions: [{ kind: "set_category", categoryId: trans }], isActive: true }), "rule");
    const def = await api("post", "/api/securities/define", { symbol: "VNM", name: "Vinamilk", currency: "VND", priceSource: "manual" });
    must(def, "security");
    const defJson = await def.json();
    const securityId = ((defJson.data ?? defJson).securityId) as number;
    must(await api("post", "/api/securities/prices", { securityId, date: today, price: 62_000 }), "security price");
    must(await api("post", "/api/portfolio/holdings/cash-sleeve", { accountId: brk, currency: "USD" }), "cash sleeve");
    must(await api("post", "/api/transactions/transfer", { fromAccountId: cash, toAccountId: momo, enteredAmount: 500_000, date: today }), "transfer");
    const split = await api("post", "/api/transactions", { date: today, accountId: cash, categoryId: groc, amount: -1_234_567, currency: "VND", payee: "Split demo" });
    must(split, "split parent");
    const splitJson = await split.json();
    const splitTxId = ((splitJson.data ?? splitJson).id) as number;
    must(await api("post", "/api/transactions/splits", { transactionId: splitTxId, splits: [{ categoryId: groc, amount: -400_000 }, { categoryId: eat, amount: -834_567 }] }), "split");
  }

  if (ADMIN) await db.query("update users set role = 'admin' where id = $1", [user.id]);
  seeded = { ...(await resolveIds(user.id)), storage: await user.ctx.storageState() };
  manifest.push({ seeded: { reused, rows: ROWS, admin: ADMIN } });
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

for (const vp of SELECTED_VIEWPORTS) {
  for (const theme of THEMES) {
    for (const pg_ of SELECTED_PAGES) {
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
          await page.screenshot({ path: shot, fullPage: FULL_PAGE });

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
