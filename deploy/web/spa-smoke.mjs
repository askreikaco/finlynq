#!/usr/bin/env node
/**
 * SPA smoke: opens EVERY SPA-enabled route (src/spa/routes.config.ts) in the SPA origin and in the Next origin,
 * fails on console errors / page errors / failed requests / HTTP >= 400 in the SPA, and pixel-compares the SPA
 * screenshot with the Next-rendered page (1440x900 and 390x844, light + dark). Also runs a few in-app navigation
 * scenarios (no full reload, query-state sync, Back).
 *
 *   node deploy/web/spa-smoke.mjs --next http://127.0.0.1:55562 --spa http://127.0.0.1:55563 --out DIR
 *        [--waves 0,1] [--only substring] [--threshold 0.5] [--tol 6] [--vp 1440,390] [--themes light,dark]
 *   env SMOKE_DATABASE_URL  throwaway Postgres (the Next server's DB): used only to mark the seeded user verified.
 *                           Never printed. Refused unless the database name ends in _test.
 *
 * Origins: the SPA origin is `vite preview` (static dist-web + /api proxied to the Next server, port-independent
 * pf_session cookie); the Next origin is the production Next server. Both on 127.0.0.1. Service workers are blocked
 * (determinism); the SW is covered by unit tests, not here.
 * Needs Node >= 22.18 (imports routes.config.ts) and playwright + pngjs + pg from node_modules; a chromium via
 * PLAYWRIGHT_BROWSERS_PATH or SMOKE_CHROMIUM.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "../..");
const require = createRequire(path.join(repo, "package.json"));
const { chromium, request } = require("playwright");
const { PNG } = require("pngjs");
const pg = require("pg");
const { SPA_ROUTES } = await import(pathToFileURL(path.join(repo, "src/spa/routes.config.ts")).href);

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const NEXT = arg("next", "");
const SPA = arg("spa", "");
const OUT = path.resolve(arg("out", "test-results/spa-smoke"));
const WAVES = arg("waves", "0,1").split(",");
const ONLY = arg("only", "");
const THRESHOLD = Number(arg("threshold", "0.5")); // % changed pixels that still passes
const TOL = Number(arg("tol", "6")); // per-channel difference ignored
const VPS = arg("vp", "1440,390").split(",").map((w) => ({ w: Number(w), h: Number(w) >= 1000 ? 900 : 844, mobile: Number(w) < 700 }));
const THEMES = arg("themes", "light,dark").split(",");
const DB_URL = process.env.SMOKE_DATABASE_URL ?? "";
if (!NEXT || !SPA) throw new Error("--next and --spa are required");
if (!/\/[^/?#]*_test([?#]|$)/.test(DB_URL)) throw new Error("SMOKE_DATABASE_URL must point at a *_test database");
mkdirSync(OUT, { recursive: true });

const WAVE0 = new Set(["/more", "/settings", "/settings/about"]);
const wave = (r) => (WAVE0.has(r) ? "0" : "1");

// ---- seed (through the Next API, like e2e/visual/size-classes.spec.ts) ----
const PW = randomBytes(18).toString("hex") + "Aa1!"; // in memory only
const tag = "smoke" + Math.random().toString(36).slice(2, 9);
const api = await request.newContext({ baseURL: NEXT, extraHTTPHeaders: { origin: NEXT, "x-forwarded-for": `10.55.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` } });
const call = async (m, p, data) => api[m](p, data === undefined ? {} : { data });
const must = async (r, what) => {
  if (!r.ok()) throw new Error(`${what}: HTTP ${r.status()}`);
  return r;
};
const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const reg = await call("post", "/api/auth/register", { username: tag, email: `${tag}@smoke.test`, password: PW, displayName: tag });
if (reg.status() !== 201) throw new Error(`register: HTTP ${reg.status()}`);
const userId = String((await reg.json()).userId);
await db.query("update users set email_verified = 1 where id = $1", [userId]);
await must(await call("post", "/api/auth/login", { identifier: tag, password: PW, trustDevice: false }), "login");
const idOf = async (r, what) => {
  const j = await (await must(r, what)).json();
  return (j.data ?? j).id;
};
const cash = await idOf(await call("post", "/api/accounts", { name: "Cash", type: "A", group: "Cash", currency: "VND" }), "account");
const tcb = await idOf(await call("post", "/api/accounts", { name: "TCB", type: "A", group: "Cash", currency: "VND" }), "account");
const card = await idOf(await call("post", "/api/accounts", { name: "Credit Card", type: "L", group: "Credit Card", currency: "VND" }), "account");
const eat = await idOf(await call("post", "/api/categories", { name: "Eating Out", type: "E", group: "Essentials" }), "category");
const groc = await idOf(await call("post", "/api/categories", { name: "Grocery", type: "E", group: "Essentials" }), "category");
const sal = await idOf(await call("post", "/api/categories", { name: "Salary", type: "I", group: "Income" }), "category");
const payees = ["COM TAM", "Highlands Coffee", "Co.opmart", "Grab ride", "Electric EVN", "Circle K"];
const day = (n) => new Date(Date.UTC(2026, 9, 14) - n * 864e5).toISOString().slice(0, 10); // fixed dates: both origins render the same data
for (let n = 0; n < 40; n++) {
  const income = n % 7 === 0;
  await must(
    await call("post", "/api/transactions", {
      date: day(n % 60), accountId: [cash, tcb, card][n % 3], categoryId: income ? sal : [eat, groc][n % 2],
      amount: income ? 45_000_000 : -(40_000 + ((n * 9173) % 900_000)), currency: "VND", payee: income ? "ACME salary" : payees[n % payees.length],
    }),
    `transaction ${n}`,
  );
}
await must(await call("post", "/api/budgets", { categoryId: eat, month: "2026-10", amount: 500_000 }), "budget");
await call("put", "/api/settings/dev-mode", { devMode: true });
await call("post", "/api/onboarding/complete");
await call("put", "/api/settings/display-currency", { displayCurrency: "VND" });
const txRow = (await db.query("select id from transactions where user_id = $1 order by id limit 1", [userId])).rows[0];
if (!txRow) throw new Error("seed: no transaction row");
const ids = { tx: txRow.id, account: tcb, category: eat };
const storage = await api.storageState();
await api.dispose();
await db.end();

// ---- route list: every SPA_ROUTES entry (dynamic params filled) + state variants ----
const fill = (r) => {
  if (r === "/filter/[list]") return ["/filter/accounts?returnTo=/accounts", "/filter/categories?returnTo=/categories"];
  if (r.startsWith("/transactions/[id]")) return [r.replace("[id]", ids.tx)];
  if (r.startsWith("/accounts/[id]")) return [r.replace("[id]", ids.account)];
  return [r];
};
const targets = [];
for (const r of SPA_ROUTES) for (const p of fill(r)) targets.push({ route: r, url: p, wave: wave(r) });
const VARIANTS = [
  ["/transactions", `/transactions?sel=${ids.tx}`], ["/transactions", "/transactions?sel=new"],
  ["/transactions", "/transactions?range=last_month"], ["/transactions", "/transactions?q=grab&sort=amount&dir=asc"],
  ["/transactions/search", "/transactions/search?q=coffee"], ["/accounts", `/accounts?sel=${ids.account}`],
  ["/categories", "/categories?edit=new"], ["/categories", `/categories?edit=${ids.category}`],
  ["/dashboard", "/dashboard?range=this_year"],
];
for (const [route, url] of VARIANTS) targets.push({ route, url, wave: wave(route), variant: true });
const selected = targets.filter((t) => WAVES.includes(t.wave) && (!ONLY || ONLY.split(",").some((o) => t.url.includes(o))));

// ---- browser helpers ----
const launch = { args: ["--no-sandbox"], ...(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {}) };
const browser = await chromium.launch(launch);
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "root";

async function open(base, t, vp, theme, wantShot) {
  const ctx = await browser.newContext({
    baseURL: base, storageState: storage, serviceWorkers: "block", reducedMotion: "reduce", colorScheme: theme,
    viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile, locale: "en-US", timezoneId: "Asia/Ho_Chi_Minh",
  });
  await ctx.addInitScript((th) => {
    try { localStorage.setItem("theme", th); } catch {}
  }, theme);
  const page = await ctx.newPage();
  const problems = [];
  const origin = new URL(base).origin;
  const rel = (u) => { try { const x = new URL(u); return x.origin === origin ? x.pathname : x.origin + x.pathname; } catch { return u; } };
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  page.on("requestfailed", (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) problems.push(`requestfailed: ${rel(r.url())} ${r.failure()?.errorText}`); });
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${rel(r.url())}`); });
  const t0 = Date.now(), seen = [];
  if (process.env.SMOKE_DEBUG) {
    page.on("response", (r) => { if (/spotlight|auth\/session/.test(r.url())) seen.push(`${new URL(r.url()).pathname}:${r.status()}@${Date.now() - t0}ms`); });
    page.on("requestfailed", (r) => { if (/spotlight|auth\/session/.test(r.url())) seen.push(`${new URL(r.url()).pathname}:FAILED@${Date.now() - t0}ms`); });
  }
  const res = await page.goto(t.url, { waitUntil: "load", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector(".animate-pulse, [aria-busy=true]"), null, { timeout: 8_000 }).catch(() => {});
  // Below-the-fold widgets mount lazily (viewport-gated): scroll the whole page once so both origins render the same set.
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight - 100);
    for (let y = 0; y < document.documentElement.scrollHeight + step; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 300));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector(".animate-pulse, [aria-busy=true]"), null, { timeout: 8_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  // Lazy widgets fetch after they mount: wait until the page height + text stop changing for 1.5 s (max 12 s).
  await page.evaluate(async () => {
    const sig = () => `${document.documentElement.scrollHeight}:${document.body.innerText.length}`;
    let last = sig(), stableSince = Date.now();
    const end = Date.now() + 12_000;
    while (Date.now() < end && Date.now() - stableSince < 1500) {
      await new Promise((r) => setTimeout(r, 250));
      const now = sig();
      if (now !== last) { last = now; stableSince = Date.now(); }
    }
  }).catch(() => {});
  let png = null;
  if (wantShot) png = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
  const title = await page.title();
  const hasActionCenter = /action center/i.test(await page.locator("body").innerText().catch(() => ""));
  if (process.env.SMOKE_DEBUG && /dashboard/.test(t.url) && !hasActionCenter) {
    const later = await page.waitForFunction(() => /action center/i.test(document.body.innerText), null, { timeout: 8000 }).then(() => true).catch(() => false);
    console.log(`  [${base.slice(-5)}] action center appeared later: ${later}`);
  }
  if (process.env.SMOKE_DEBUG && /dashboard/.test(t.url)) {
    const html = await page.evaluate(() => { const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /weekly recap/i.test(e.textContent || "")); const g = el?.closest(".grid"); return g ? g.outerHTML : "no grid"; }).catch(() => "err");
    writeFileSync(path.join(OUT, `debug-${base.slice(-5)}-${theme}-${hasActionCenter}.html`), html);
  }
  if (process.env.SMOKE_DEBUG) console.log(`  [${base.slice(-5)}] ${t.url} ${vp.w} ${theme} actionCenter=${hasActionCenter} problems=${problems.length} ${seen.join(" ")}`);
  const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
  await ctx.close();
  return { problems, png, status: res?.status() ?? 0, title, finalPath };
}

function diff(a, b, name) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
  const out = new PNG({ width: w, height: h });
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const inA = x < A.width && y < A.height, inB = x < B.width && y < B.height;
      let bad = !(inA && inB);
      if (inA && inB) {
        const ia = (y * A.width + x) * 4, ib = (y * B.width + x) * 4;
        for (let c = 0; c < 4; c++) if (Math.abs(A.data[ia + c] - B.data[ib + c]) > TOL) { bad = true; break; }
      }
      if (bad) { changed++; out.data[o] = 255; out.data[o + 1] = 0; out.data[o + 2] = 0; out.data[o + 3] = 255; }
      else { const ia = (y * A.width + x) * 4; out.data[o] = A.data[ia] >> 1; out.data[o + 1] = A.data[ia + 1] >> 1; out.data[o + 2] = A.data[ia + 2] >> 1; out.data[o + 3] = 255; }
    }
  }
  return { pct: (changed / (w * h)) * 100, sizeA: `${A.width}x${A.height}`, sizeB: `${B.width}x${B.height}`, png: changed ? PNG.sync.write(out) : null };
}

// ---- run the matrix ----
const rows = [];
for (const t of selected) {
  for (const vp of VPS) {
    for (const theme of THEMES) {
      const key = `${slug(t.url)}__${vp.w}__${theme}`;
      const row = { url: t.url, route: t.route, wave: t.wave, vp: vp.w, theme, ok: false };
      try {
        // Late-mounting widgets / forms make a single capture racy (dashboard widget order, split-pane form): a cell that
        // only fails on pixels is captured once more and the closer pair counts (reported as retried).
        const attempt = async () => {
          const n = await open(NEXT, t, vp, theme, true);
          const s = await open(SPA, t, vp, theme, true);
          return { n, s, d: diff(n.png, s.png, key) };
        };
        let { n, s, d } = await attempt();
        if (d.pct > THRESHOLD && s.problems.every((p) => n.problems.includes(p))) {
          const again = await attempt();
          row.retried = true;
          row.firstDiffPct = Number(d.pct.toFixed(3));
          if (again.d.pct < d.pct) ({ n, s, d } = again);
        }
        Object.assign(row, { diffPct: Number(d.pct.toFixed(3)), sizeNext: d.sizeA, sizeSpa: d.sizeB, spaProblems: s.problems, nextProblems: n.problems, spaStatus: s.status, nextStatus: n.status, finalSpa: s.finalPath, finalNext: n.finalPath });
        const extra = s.problems.filter((p) => !n.problems.includes(p));
        row.newProblems = extra;
        row.ok = extra.length === 0 && d.pct <= THRESHOLD && s.status < 400 && d.sizeA === d.sizeB;
        if (!row.ok || process.env.SMOKE_KEEP_ALL === "1") {
          writeFileSync(path.join(OUT, `${key}.next.png`), n.png);
          writeFileSync(path.join(OUT, `${key}.spa.png`), s.png);
          if (d.png) writeFileSync(path.join(OUT, `${key}.diff.png`), d.png);
        }
      } catch (e) {
        row.error = String(e.message ?? e).slice(0, 300);
      }
      rows.push(row);
      console.log(`${row.ok ? "ok  " : "FAIL"} w${t.wave} ${t.url} ${vp.w} ${theme} diff=${row.diffPct ?? "?"}%${row.retried ? ` (retried, first ${row.firstDiffPct}%)` : ""} ${row.newProblems?.length ? `errors=${row.newProblems.length}` : ""}${row.error ? ` error=${row.error}` : ""}`);
    }
  }
}

// ---- in-app scenarios (SPA origin, 1440x900 light) ----
const scenarios = [];
async function scenario(name, fn, allow = null) {
  const ctx = await browser.newContext({ baseURL: SPA, storageState: storage, serviceWorkers: "block", reducedMotion: "reduce", viewport: { width: 1440, height: 900 }, locale: "en-US" });
  await ctx.addInitScript(() => { try { localStorage.setItem("theme", "light"); } catch {} });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !(allow && allow.test(m.text()))) problems.push(`console.error: ${m.text().slice(0, 200)}`); });
  let res;
  try { res = (await fn(page)) ?? "ok"; } catch (e) { res = `FAIL ${String(e.message).split("\n")[0].slice(0, 200)}`; }
  scenarios.push({ name, result: res, ok: res === "ok" && problems.length === 0, problems });
  console.log(`${res === "ok" && problems.length === 0 ? "ok  " : "FAIL"} scenario ${name}: ${res}${problems.length ? ` problems=${problems.length}` : ""}`);
  await ctx.close();
}
const settle = async (page) => { await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(300); };
const marker = (page) => page.evaluate(() => (window.__smokeMarker === 1 ? "kept" : "lost"));
if (WAVES.includes("1") && (!ONLY || process.argv.includes("--scenarios"))) {
  await scenario("in-app nav dashboard->transactions->accounts->categories->more keeps one document", async (page) => {
    await page.goto("/dashboard"); await settle(page);
    await page.evaluate(() => { window.__smokeMarker = 1; });
    for (const href of ["/transactions", "/accounts", "/categories", "/more"]) {
      await page.locator(`a[href="${href}"]:visible`).first().click(); await page.waitForURL(`**${href}`, { timeout: 10_000 }); await settle(page);
      if ((await marker(page)) !== "kept") throw new Error(`full reload on navigation to ${href}`);
    }
    await page.goBack(); await settle(page);
    if (new URL(page.url()).pathname !== "/categories") throw new Error("Back did not return to /categories");
    if ((await marker(page)) !== "kept") throw new Error("Back reloaded the document");
  });
  await scenario("link to a Next-only page does a full page load (/accounts/groups is not swallowed by /accounts/[id])", async (page) => {
    await page.goto("/accounts"); await settle(page);
    const hit = await page.evaluate(() => [...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/accounts/groups"));
    // the SPA classifier is what decides; assert it directly through a synthetic link click when the link exists
    if (hit) {
      await page.evaluate(() => { window.__smokeMarker = 1; });
      await Promise.all([page.waitForNavigation({ timeout: 10_000 }).catch(() => null), page.evaluate(() => document.querySelector('a[href="/accounts/groups"]').click())]);
      if ((await marker(page).catch(() => "lost")) === "kept") throw new Error("/accounts/groups was handled in-app");
    } else return "ok (no link to /accounts/groups on the page; classifier covered by tests/spa/route-table.test.ts)";
  }, /status of 404|404/); // the preview origin has no Next behind non-SPA paths: the 404 resource log is expected
  await scenario("transactions: ?q typed in the toolbar lands in the URL without a reload; row click sets ?sel in the split view", async (page) => {
    await page.goto("/transactions"); await settle(page);
    await page.evaluate(() => { window.__smokeMarker = 1; });
    const search = page.locator('input[type="search"], input[placeholder*="earch"]').first();
    if (await search.count()) {
      await search.fill("grab"); await page.waitForTimeout(600);
      if (!new URL(page.url()).searchParams.get("q")) throw new Error("?q missing after typing");
    }
    const link = page.locator(`a[href*="/transactions/${ids.tx}/edit"], [data-testid^="tx-row"]`).first();
    if (await link.count()) {
      await link.click(); await settle(page);
      if ((await marker(page)) !== "kept") throw new Error("row click reloaded the document");
    }
  });
  await scenario("unknown filter list renders not-found", async (page) => {
    await page.goto("/filter/nope"); await settle(page);
    // vite preview only maps SPA routes to index.html; /filter/nope is a [list] match, the page itself 404s
    const txt = await page.locator("body").innerText();
    if (!/could not be found|not found/i.test(txt)) throw new Error(`no not-found state: ${txt.slice(0, 80)}`);
  }, /NEXT_NOT_FOUND/); // React Router logs the NotFoundError it caught: expected here
}
await browser.close();

const failed = rows.filter((r) => !r.ok), failedSc = scenarios.filter((s) => !s.ok);
const summary = { when: new Date().toISOString(), next: NEXT, spa: SPA, threshold: THRESHOLD, tol: TOL, total: rows.length, failed: failed.length, rows, scenarios };
writeFileSync(path.join(OUT, "results.json"), JSON.stringify(summary, null, 2));
const md = ["| wave | route | vp | theme | diff% | size next/spa | new SPA errors |", "|---|---|---|---|---|---|---|"];
for (const r of rows) md.push(`| ${r.wave} | ${r.url} | ${r.vp} | ${r.theme} | ${r.diffPct ?? "-"} | ${r.sizeNext === r.sizeSpa ? "=" : `${r.sizeNext}/${r.sizeSpa}`} | ${r.error ?? ((r.newProblems ?? []).join("; ") || "-")} |`);
writeFileSync(path.join(OUT, "results.md"), md.join("\n") + "\n");
console.log(`\nSMOKE ${rows.length - failed.length}/${rows.length} cells ok, scenarios ${scenarios.length - failedSc.length}/${scenarios.length} ok -> ${OUT}`);
process.exit(failed.length || failedSc.length ? 1 : 0);
