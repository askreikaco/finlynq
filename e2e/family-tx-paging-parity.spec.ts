/**
 * Transactions paging parity (plan P8, API level, real Postgres).
 *
 * For each scenario: OLD = legacy GET /api/transactions?limit=100000 (no cursor, same filters and
 * sort, server applies the filter); NEW = walk GET ?limit=7&cursor=... until nextCursor is null.
 * Asserts identical id sequences, totals, no duplicate ids, `total` only on the first page, and that
 * a text search for a payee that exists only in OLD rows (older than the 1000th most recent row)
 * returns those rows in NEW (the old client cap bug).
 *
 * Seeds 1,100 rows (the cap assertion needs more than 1000). Run:
 *   FAMILY_E2E_DATABASE_URL=postgresql://...<name>_test npx playwright test -c playwright.family.config.ts e2e/family-tx-paging-parity.spec.ts
 */
import { test, expect } from "@playwright/test";
import { TestUser } from "./family-helpers";

const ROWS = 1100;
const PAGE = 7;
const OLD_PAYEE = "Zanzibar Kiosk";
const DAYS = 90;
const dayStr = (n: number) => new Date(Date.UTC(2025, 0, 1) + n * 864e5).toISOString().slice(0, 10);

type Seeded = { id: number; date: string; amount: number; accountId: number; categoryId: number };

let user: TestUser;
let accounts: number[] = [];
let categories: number[] = [];
let seeded: Seeded[] = [];
let oldPayeeIds = new Set<number>();
let cutoffDate = ""; // date of the 1000th most recent row (rows strictly older than this are "older than the 1000th")

test.setTimeout(900_000);

test.beforeAll(async () => {
  user = await TestUser.register("txp");
  accounts = [
    await user.createAccount("Chequing"),
    await user.createAccount("Savings", { group: "Banking" }),
    await user.createAccount("Brokerage", { type: "A", group: "Investments" }),
  ];
  categories = [
    await user.createCategory("Groceries", "E", "Food"),
    await user.createCategory("Salary", "I", "Income"),
    await user.createCategory("Dividends", "I", "Income"),
    await user.createCategory("Transfer", "E", "Transfer"),
  ];

  // Deterministic PRNG (mulberry32) so the fixture is the same every run.
  let a = 0x5eed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

  const PAYEES = ["Metro", "Metro Market", "Payroll Co", "Brokerage Fee", "Corner Cafe", "Acme", ""];
  const NOTES = ["weekly shop", "", "bonus", "fee waiver", "split with partner", "dividend Q3"];
  const TAGS = ["", "food", "food,weekly", "salary", "fees,travel", "invest", "food,fees"];
  const AMOUNTS = [-120.5, -45, -45, 0, 0, 2500, 1200.25, -9.99, 75, -300, 45, -1000];
  const QUANTITIES = [undefined, undefined, 1, 3, 0.5];

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < ROWS; i++) {
    const day = Math.floor(rnd() * DAYS); // heavy date ties: ~12 rows per day
    const payee = pick(PAYEES);
    rows.push({
      date: dayStr(day),
      accountId: pick(accounts),
      categoryId: pick(categories),
      amount: pick(AMOUNTS),
      currency: "USD",
      quantity: pick(QUANTITIES),
      payee: payee || undefined,
      note: pick(NOTES) || undefined,
      tags: pick(TAGS) || undefined,
      isBusiness: rnd() < 0.2 ? 1 : 0,
    });
  }
  // Payee that exists only in the 3 oldest-dated rows (ensured below).
  rows[0] = { ...rows[0], date: dayStr(0), payee: OLD_PAYEE, amount: -77.77 };
  rows[1] = { ...rows[1], date: dayStr(0), payee: OLD_PAYEE, amount: -12.34 };
  rows[2] = { ...rows[2], date: dayStr(1), payee: OLD_PAYEE, amount: 5 };
  for (let i = 3; i < rows.length; i++) if (rows[i].payee === OLD_PAYEE) rows[i] = { ...rows[i], payee: "Metro" };

  // Seed through the real API, 8 requests in flight.
  const ids: Seeded[] = [];
  for (let i = 0; i < rows.length; i += 8) {
    const chunk = rows.slice(i, i + 8);
    const res = await Promise.all(chunk.map((r) => user.post("/api/transactions", r)));
    for (let j = 0; j < res.length; j++) {
      const body = await user.json<{ id: number }>(res[j], 201);
      ids.push({ id: body.id, date: String(chunk[j].date), amount: Number(chunk[j].amount), accountId: Number(chunk[j].accountId), categoryId: Number(chunk[j].categoryId) });
    }
  }
  seeded = ids;
  expect(seeded.length).toBe(ROWS);
  expect(seeded.every((r) => r.id > 0)).toBe(true);

  // Rows that are older than the 1000th most recent (date desc order).
  const byDateDesc = [...seeded].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.id - x.id));
  cutoffDate = byDateDesc[999].date;
  oldPayeeIds = new Set(seeded.slice(0, 3).map((r) => r.id));
  expect(oldPayeeIds.size).toBe(3);
  // Only the first three seeded rows carry the old payee; they are older than the cutoff.
  expect(seeded.filter((r) => oldPayeeIds.has(r.id)).every((r) => r.date < cutoffDate)).toBe(true);
});

test.afterAll(async () => {
  await user?.dispose();
});

type Scn = { id: string; params: Record<string, string>; sort?: { col: string; dir: "asc" | "desc" } };

function scenarios(): Scn[] {
  const [acc1, acc2] = accounts;
  const [cat1, cat2] = categories;
  return [
    { id: "default-sort", params: {} },
    { id: "date-asc", params: {}, sort: { col: "date", dir: "asc" } },
    { id: "date-desc-explicit", params: {}, sort: { col: "date", dir: "desc" } },
    { id: "amount-asc", params: {}, sort: { col: "amount", dir: "asc" } },
    { id: "amount-desc", params: {}, sort: { col: "amount", dir: "desc" } },
    { id: "quantity-asc", params: {}, sort: { col: "quantity", dir: "asc" } },
    { id: "filter-account", params: { accountId: String(acc1) } },
    { id: "filter-account-date-asc", params: { accountId: String(acc2) }, sort: { col: "date", dir: "asc" } },
    { id: "filter-category", params: { categoryId: String(cat1) } },
    { id: "filter-category-list", params: { categoryId: `${cat1},${cat2}` }, sort: { col: "amount", dir: "asc" } },
    { id: "filter-date-range", params: { startDate: dayStr(20), endDate: dayStr(60) } },
    { id: "filter-date-range-amount-desc", params: { startDate: dayStr(20), endDate: dayStr(60) }, sort: { col: "amount", dir: "desc" } },
    { id: "filter-amount-range", params: { minAmount: "-50", maxAmount: "100" } },
    { id: "filter-amount-range-amount-asc", params: { minAmount: "-50", maxAmount: "100" }, sort: { col: "amount", dir: "asc" } },
    { id: "filter-direction-out", params: { direction: "out" } },
    { id: "filter-direction-in-date-asc", params: { direction: "in" }, sort: { col: "date", dir: "asc" } },
    { id: "search-old-payee", params: { search: "zanzibar" } },
    { id: "search-old-payee-date-asc", params: { search: "zanzibar" }, sort: { col: "date", dir: "asc" } },
    { id: "filter-tag", params: { tag: "food" } },
    { id: "filter-note", params: { filter_note: "fee" } },
    { id: "combo-account-amount-asc", params: { accountId: String(acc1), minAmount: "-200" }, sort: { col: "amount", dir: "asc" } },
    { id: "combo-tag-date-range-quantity-desc", params: { tag: "food,fees", startDate: dayStr(10), endDate: dayStr(80) }, sort: { col: "quantity", dir: "desc" } },
  ];
}

function qs(p: Record<string, string>, sort?: Scn["sort"]) {
  const q = new URLSearchParams(p);
  if (sort) {
    q.set("sort", sort.col);
    q.set("sortDir", sort.dir);
  }
  return q;
}

async function legacyIds(s: Scn): Promise<{ ids: number[]; total: number }> {
  const q = qs(s.params, s.sort);
  q.set("limit", "100000");
  const body = await user.json<{ data: Array<{ id: number }>; total: number | string }>(await user.get(`/api/transactions?${q}`));
  // total is a pg count (string) on the plain-filter path and a number on the text-filter path.
  return { ids: body.data.map((r) => r.id), total: Number(body.total) };
}

async function cursorWalk(s: Scn): Promise<{ ids: number[]; firstTotal: number | undefined; laterTotals: Array<number | undefined>; pages: number }> {
  const ids: number[] = [];
  const laterTotals: Array<number | undefined> = [];
  let firstTotal: number | undefined;
  let cursor = "";
  let pages = 0;
  for (;;) {
    const q = qs(s.params, s.sort);
    q.set("limit", String(PAGE));
    q.set("cursor", cursor);
    const body = await user.json<{ data: Array<{ id: number }>; nextCursor: string | null; hasMore: boolean; total?: number | string }>(
      await user.get(`/api/transactions?${q}`),
    );
    pages++;
    expect(body.data.length).toBeLessThanOrEqual(PAGE);
    if (pages === 1) firstTotal = body.total === undefined ? undefined : Number(body.total);
    else laterTotals.push(body.total === undefined ? undefined : Number(body.total));
    ids.push(...body.data.map((r) => r.id));
    if (!body.nextCursor) {
      expect(body.hasMore).toBe(false);
      break;
    }
    expect(body.hasMore).toBe(true);
    cursor = body.nextCursor;
    if (pages > 500) throw new Error(`cursor walk did not terminate for ${s.id}`);
  }
  return { ids, firstTotal, laterTotals, pages };
}

test("every scenario: cursor walk (limit=7) equals legacy full list", async () => {
  const report: string[] = [];
  for (const s of scenarios()) {
    const old = await legacyIds(s);
    const neu = await cursorWalk(s);
    const unique = new Set(neu.ids);
    expect(unique.size, `${s.id}: duplicate ids in NEW walk`).toBe(neu.ids.length);
    expect(neu.ids, `${s.id}: id sequence`).toEqual(old.ids);
    expect(neu.firstTotal, `${s.id}: total on first page`).toBe(old.total);
    expect(neu.laterTotals.every((t) => t === undefined), `${s.id}: total must be absent on later pages`).toBe(true);
    expect(neu.ids.length, `${s.id}: total vs walked rows`).toBe(old.total);
    report.push(`${s.id} rows=${old.total} pages=${neu.pages}`);
  }
  console.log(report.join("\n"));
});

test("search for a payee that exists only in old rows returns them in NEW", async () => {
  const s = scenarios().find((x) => x.id === "search-old-payee")!;
  const neu = await cursorWalk(s);
  const got = new Set(neu.ids);
  for (const id of oldPayeeIds) expect(got.has(id), `old row ${id} missing from NEW search`).toBe(true);
  const olderThanCutoff = neu.ids.filter((id) => {
    const row = seeded.find((r) => r.id === id);
    return row !== undefined && row.date < cutoffDate;
  });
  expect(olderThanCutoff.length, "rows older than the 1000th most recent").toBeGreaterThan(0);
  // Client cap bug: NEW must not be capped at 1000 rows (search total is the full match count).
  expect(neu.firstTotal).toBe(neu.ids.length);
});

test("amount-asc with heavy ties: first page total, full walk, no duplicates", async () => {
  const s: Scn = { id: "ties-amount-asc", params: {}, sort: { col: "amount", dir: "asc" } };
  const page1 = await user.json<{ data: Array<{ id: number; amount: number }>; nextCursor: string | null; total: number | string }>(
    await user.get(`/api/transactions?${qs(s.params, s.sort)}&limit=${PAGE}&cursor=`),
  );
  expect(Number(page1.total)).toBe(ROWS);
  expect(page1.data.length).toBe(PAGE);
  const walk = await cursorWalk(s);
  expect(walk.ids.length).toBe(ROWS);
  expect(new Set(walk.ids).size).toBe(ROWS);
});
