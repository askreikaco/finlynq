/** Synthetic API payloads for the read-cache tests. Shapes copied from the routes (2026-10-10). No real data. */
import type { FetchLike, FetchResponseLike } from "@/lib/local-first/read-cache/hydrate";

export function jsonRes(body: unknown, status = 200): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

export const RAW_ACCOUNTS: unknown[] = [
  { id: 1, userId: "u", type: "A", group: "Bank", currency: "CAD", name: null, alias: null, archived: false, isInvestment: false, invisible: false },
  { id: 2, userId: "u", type: "L", group: "Card", currency: "CAD", name: null, archived: true, isInvestment: false, invisible: false },
  { id: 3, userId: "u", type: "A", group: "Bank", currency: "USD", name: null, archived: false, isInvestment: false, invisible: true },
  { id: 4, userId: "u", type: "A", group: "Bank", currency: "USD", name: null, archived: true, isInvestment: false, invisible: true },
  { id: "not-a-number", type: "A", group: "Bank", currency: "CAD", archived: false, isInvestment: false, invisible: false }, // unmappable
  { type: "A", group: "Bank", currency: "CAD", archived: false, isInvestment: false, invisible: false }, // no id, unmappable
];

export const RAW_CATEGORIES: unknown[] = [
  { id: 10, userId: "u", type: "E", group: "Living", name: null },
  { id: 11, userId: "u", type: "I", group: "Income", name: "Salary" },
  { id: 12, userId: "u", type: 5, group: "Other", name: "bad type" }, // unmappable
];

export const RAW_TX_PAGE_1 = {
  data: [
    { id: 100, date: "2026-01-05", accountId: 1, categoryId: 10, currency: "CAD", amount: -50, payee: "", note: "", tags: "" },
    { id: 101, date: "2026-01-06", accountId: 1, categoryId: 11, currency: "CAD", amount: "1000.5", enteredAmount: null, payee: "Payroll" },
    { id: 102, date: "01/07/2026", accountId: 1, categoryId: 10, currency: "CAD", amount: 5 }, // bad date, unmappable
    { id: 103, date: "2026-01-08", accountId: null, categoryId: null, currency: "CAD", amount: 7 },
  ],
  nextCursor: "cursor-2",
  hasMore: true,
  total: 5,
};

export const RAW_TX_PAGE_2 = {
  data: [
    { id: 104, date: "2026-02-01", accountId: 3, categoryId: 10, currency: "USD", amount: 40 },
    { id: 105, date: "2026-02-02", accountId: 4, categoryId: null, currency: "USD", amount: 200 },
    { id: 106, date: "2026-02-03", accountId: 2, categoryId: 10, currency: "CAD", amount: null }, // unmappable
  ],
  nextCursor: null,
  hasMore: false,
};

/** Routes the fake API. Records every requested URL. */
export function fakeApi(opts: { accounts?: unknown; categories?: unknown; pages?: unknown[] } = {}) {
  const urls: string[] = [];
  const pages = opts.pages ?? [RAW_TX_PAGE_1, RAW_TX_PAGE_2];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    if (url.startsWith("/api/accounts")) return jsonRes(opts.accounts ?? RAW_ACCOUNTS);
    if (url.startsWith("/api/categories")) return jsonRes(opts.categories ?? RAW_CATEGORIES);
    if (url.startsWith("/api/transactions")) {
      const cursor = new URL(url, "http://local").searchParams.get("cursor");
      const index = cursor === "" ? 0 : pages.findIndex((_, i) => i > 0 && cursor === `cursor-${i + 1}`);
      if (index < 0 || index >= pages.length) return jsonRes({ error: "Invalid cursor" }, 400);
      return jsonRes(pages[index]);
    }
    return jsonRes({ error: "not found" }, 404);
  };
  return { fetchImpl, urls };
}
