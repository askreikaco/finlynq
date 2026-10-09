/**
 * Transactions paging in the browser (plan P8 UI), at 390x844 (mobile list) and 1280x800 (table).
 *
 * Seeds 130 rows through the API. Asserts: first list request is `limit=50&cursor=`, no request
 * carries limit=100000 (export is never clicked), scrolling loads page 2 and then shows
 * "Showing all 130 transactions", an edit on page 2 updates the row without collapsing the list,
 * a delete drops the count by 1, a create on /transactions/new shows up first on /transactions,
 * a search finds a row older than the first page, and /accounts/<id> shows only that account.
 *
 * Mobile has no delete control (the table is md-and-up only), so that step deletes via the API
 * and checks the count in the browser. Run:
 *   MOB_E2E_DATABASE_URL=postgresql://...<name>_test npx playwright test -c playwright.mobile.config.ts e2e/mobile-tx-paging.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { TestUser } from "./family-helpers";

const ROWS = 130;
const dayStr = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 864e5).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(3, "0");

type Seed = { user: TestUser; acctA: number; acctB: number; catId: number; ids: Map<string, number> };

async function seedUser(prefix: string): Promise<Seed> {
  const user = await TestUser.register(prefix);
  const acctA = await user.createAccount("Alpha Checking");
  const acctB = await user.createAccount("Bravo Savings");
  const catId = await user.createCategory("Groceries", "E", "Food");
  const ids = new Map<string, number>();
  // i = 0..129 has date 2026-01-01 + i (distinct dates, newest first on the list).
  const items: Array<{ key: string; body: Record<string, unknown> }> = [];
  for (let i = 0; i < ROWS - 1; i++) {
    const even = i % 2 === 0;
    const key = `${even ? "Alpha" : "Bravo"} ${pad(i)}`;
    items.push({ key, body: { date: dayStr(i), accountId: even ? acctA : acctB, categoryId: catId, amount: -(10 + i), currency: "USD", payee: key } });
  }
  items.push({ key: "Ancient Vendor Zed", body: { date: "2019-06-01", accountId: acctA, categoryId: catId, amount: -99, currency: "USD", payee: "Ancient Vendor Zed" } });
  for (let i = 0; i < items.length; i += 8) {
    const chunk = items.slice(i, i + 8);
    const res = await Promise.all(chunk.map((it) => user.post("/api/transactions", it.body)));
    for (let j = 0; j < res.length; j++) ids.set(chunk[j].key, (await user.json<{ id: number }>(res[j], 201)).id);
  }
  expect(ids.size).toBe(ROWS);
  return { user, acctA, acctB, catId, ids };
}

async function openPage(page: Page, s: Seed, url: string) {
  // Shared session: reuse the registered context's cookies for this browser page.
  const state = await s.user.ctx.storageState();
  await page.context().addCookies(state.cookies);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

for (const [w, h, mobile] of [[390, 844, true], [1280, 800, false]] as const) {
  test.describe(`${mobile ? "mobile" : "desktop"} ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    test.setTimeout(900_000);

    test("paging, edit, delete, create, search and account view", async ({ page }) => {
      const s = await seedUser(mobile ? "mtxm" : "mtxd");
      const { user, acctA, ids } = s;
      const rowEdit = (name: string) => (mobile
        ? page.getByRole("button", { name: `Edit ${name}`, exact: true })
        : page.locator("tbody tr", { hasText: name }).getByRole("button", { name: "Edit", exact: true }));
      const rowCount = () => (mobile ? page.locator('button[aria-label^="Edit "]') : page.locator("tbody tr")).count();

      const listUrls: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/api/transactions?")) listUrls.push(r.url());
      });

      // ---- first page ----
      await openPage(page, s, "/transactions");
      await expect.poll(() => listUrls.length, { timeout: 60_000 }).toBeGreaterThan(0);
      const first = new URL(listUrls[0]).search.slice(1);
      expect(first.startsWith("limit=50&cursor="), `first list request: ${first}`).toBe(true);
      expect(listUrls.some((u) => u.includes("limit=100000")), "limit=100000 must not be requested").toBe(false);
      await expect.poll(() => rowCount(), { timeout: 120_000 }).toBe(50);

      // ---- scroll loads page 2, then all rows (each scroll into the sentinel loads one page) ----
      const trigger = page.getByTestId("infinite-scroll-trigger");
      const showingAll = page.getByText("Showing all 130 transactions");
      await expect.poll(async () => {
        await trigger.scrollIntoViewIfNeeded();
        return listUrls.filter((u) => /cursor=[^&]+/.test(u)).length;
      }, { timeout: 60_000 }).toBeGreaterThan(0);
      await expect.poll(() => rowCount(), { timeout: 60_000 }).toBeGreaterThan(50);
      await expect.poll(async () => {
        await trigger.scrollIntoViewIfNeeded();
        return showingAll.isVisible();
      }, { timeout: 90_000, intervals: [500] }).toBe(true);
      await expect.poll(() => rowCount(), { timeout: 30_000 }).toBe(ROWS);
      expect(listUrls.some((u) => u.includes("limit=100000")), "limit=100000 after scrolling").toBe(false);

      // ---- edit a page-2 row (Alpha 060 is date-rank 69 of 130, so it is on page 2) ----
      const target = "Alpha 060";
      const edit = rowEdit(target);
      await edit.scrollIntoViewIfNeeded();
      await edit.click();
      const dlg = page.getByRole("dialog");
      await dlg.locator(`input[value="${target}"]`).fill("Edited 060");
      await dlg.getByRole("button", { name: "Update Transaction" }).click();
      await expect(dlg).toBeHidden({ timeout: 60_000 });
      await expect(rowEdit("Edited 060")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Showing all 130 transactions")).toBeVisible();
      expect(await rowCount(), "list collapsed after edit").toBe(ROWS);

      // ---- delete one row (desktop UI; mobile has no delete control, so API + browser recount) ----
      if (!mobile) {
        await page.locator("tbody tr", { hasText: "Edited 060" }).getByRole("button", { name: "Delete", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
        await expect.poll(() => rowCount(), { timeout: 60_000 }).toBe(ROWS - 1);
      } else {
        const del = await user.req("delete", `/api/transactions?id=${ids.get("Alpha 060")}`);
        expect(del.ok(), await del.text()).toBeTruthy();
        await openPage(page, s, "/transactions");
        await expect.poll(() => rowCount(), { timeout: 60_000 }).toBe(50);
        const trig = page.getByTestId("infinite-scroll-trigger");
        await expect.poll(async () => {
          await trig.scrollIntoViewIfNeeded();
          return page.getByText("Showing all 129 transactions").isVisible();
        }, { timeout: 90_000, intervals: [500] }).toBe(true);
        expect(await rowCount()).toBe(ROWS - 1);
      }

      // ---- create via /transactions/new, then it is first on /transactions ----
      await openPage(page, s, "/transactions/new");
      await page.getByRole("button", { name: /^\$/ }).first().click(); // amount pad
      for (const k of ["1", "2", ".", "5"]) await page.getByRole("button", { name: k, exact: true }).click();
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await page.getByRole("textbox", { name: "Payee", exact: true }).fill("Created Row Q");
      await page.getByRole("button", { name: /^Category/ }).click();
      await page.getByPlaceholder("Search category...").fill("Groceries");
      await page.getByRole("button", { name: /Groceries/ }).first().click();
      await page.getByRole("button", { name: /^Save / }).click();
      await page.waitForURL(/\/transactions(\?|$)/, { timeout: 120_000 });
      if (mobile) {
        await expect(page.getByRole("button", { name: /^Edit / }).first()).toHaveAccessibleName("Edit Created Row Q", { timeout: 60_000 });
      } else {
        await expect(page.locator("tbody tr").first()).toContainText("Created Row Q", { timeout: 60_000 });
      }

      // ---- search finds an old row (the oldest date, beyond the first page) ----
      await openPage(page, s, "/transactions?search=Ancient");
      await expect.poll(() => rowCount(), { timeout: 60_000 }).toBe(1);
      await expect(page.locator("main")).toContainText("Ancient Vendor Zed", { timeout: 60_000 });

      // ---- /accounts/<id> shows only that account's rows ----
      await openPage(page, s, `/accounts/${acctA}`);
      await expect(page.locator("main")).toContainText("Alpha 128", { timeout: 60_000 });
      const main = await page.locator("main").innerText();
      expect(main, "Bravo rows on Alpha account page").not.toContain("Bravo");
      await user.dispose();
    });
  });
}
