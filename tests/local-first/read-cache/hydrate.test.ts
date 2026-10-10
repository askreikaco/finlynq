// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  hydrateFromApi,
  mapAccount,
  mapCategory,
  mapTransaction,
  HydrateError,
  HYDRATE_BATCH,
  type UpsertStore,
} from "@/lib/local-first/read-cache/hydrate";
import type { LocalRow, TableName } from "@/lib/local-first/store/types";
import { fakeApi, jsonRes, RAW_ACCOUNTS, RAW_CATEGORIES, RAW_TX_PAGE_1, RAW_TX_PAGE_2 } from "./fixtures";

function recordingStore() {
  const calls: Array<{ table: TableName; size: number }> = [];
  const rows = new Map<TableName, Map<string, LocalRow>>();
  const store: UpsertStore = {
    upsertRows: vi.fn(async (table: TableName, batch: LocalRow[]) => {
      calls.push({ table, size: batch.length });
      const m = rows.get(table) ?? new Map<string, LocalRow>();
      for (const r of batch) m.set(r.id, r);
      rows.set(table, m);
    }),
  };
  return { store, calls, rows };
}

describe("row mappers", () => {
  it("maps a full account and coerces numeric ids to strings", () => {
    expect(mapAccount({ id: 7, type: "A", group: "Bank", currency: "CAD", name: "Chk", archived: true, isInvestment: false, invisible: false })).toEqual({
      id: "7",
      serverId: 7,
      type: "A",
      group: "Bank",
      currency: "CAD",
      name: "Chk",
      archived: true,
      isInvestment: false,
      invisible: false,
    });
  });

  it("defaults missing booleans to false and missing text to null", () => {
    expect(mapAccount({ id: 1 })).toMatchObject({ id: "1", type: null, group: null, name: null, archived: false, invisible: false });
  });

  it("rejects accounts with a non-numeric id or a wrongly typed field", () => {
    expect(mapAccount({ id: "x", type: "A" })).toBeNull();
    expect(mapAccount({ id: 1, type: 3 })).toBeNull();
    expect(mapAccount({ id: 1, archived: "yes" })).toBeNull();
    expect(mapAccount(null)).toBeNull();
    expect(mapAccount([1, 2])).toBeNull();
  });

  it("maps categories and rejects a wrongly typed type", () => {
    expect(mapCategory({ id: 3, type: "E", group: "G", name: null })).toEqual({ id: "3", serverId: 3, type: "E", group: "G", name: null });
    expect(mapCategory({ id: 3, type: 9 })).toBeNull();
  });

  it("maps transactions, accepts numeric-string amounts, and rejects a bad date or missing amount", () => {
    expect(mapTransaction({ id: 5, date: "2026-03-01", accountId: 1, categoryId: null, amount: "12.5" })).toMatchObject({
      id: "5",
      date: "2026-03-01",
      accountId: "1",
      categoryId: null,
      amount: 12.5,
    });
    expect(mapTransaction({ id: 5, date: "2026/03/01", amount: 1 })).toBeNull();
    expect(mapTransaction({ id: 5, date: "2026-03-01", amount: null })).toBeNull();
    expect(mapTransaction({ id: 5, date: "2026-03-01", amount: 1, accountId: "abc" })).toBeNull();
    expect(mapTransaction({ id: 5, date: "2026-03-01", amount: Number.NaN })).toBeNull();
  });
});

describe("hydrateFromApi", () => {
  it("hydrates bare-array accounts/categories and two cursor pages, counting unmappable rows", async () => {
    const api = fakeApi();
    const { store, rows } = recordingStore();
    const result = await hydrateFromApi(api.fetchImpl, store);
    expect(result.loaded).toEqual({ accounts: 4, categories: 2, transactions: 5 });
    expect(result.skipped).toEqual({ accounts: 2, categories: 1, transactions: 2 });
    expect(result.pages).toBe(2);
    expect(rows.get("accounts")?.size).toBe(4);
    expect(rows.get("transactions")?.size).toBe(5);
    expect(rows.get("transactions")?.get("106")).toBeUndefined();
  });

  it("requests archived accounts and walks the transaction cursor, encoding it", async () => {
    const api = fakeApi();
    await hydrateFromApi(api.fetchImpl, recordingStore().store);
    expect(api.urls).toEqual([
      "/api/accounts?includeArchived=1",
      "/api/categories",
      "/api/transactions?limit=200&cursor=",
      "/api/transactions?limit=200&cursor=cursor-2",
    ]);
  });

  it("accepts {success, data} envelopes for accounts, categories and transaction pages", async () => {
    const fetchImpl = async (url: string) => {
      if (url.startsWith("/api/accounts")) return jsonRes({ success: true, data: RAW_ACCOUNTS });
      if (url.startsWith("/api/categories")) return jsonRes({ success: true, data: { data: RAW_CATEGORIES } });
      if (url.startsWith("/api/transactions")) {
        const cursor = new URL(url, "http://local").searchParams.get("cursor");
        return jsonRes({ success: true, data: cursor === "" ? RAW_TX_PAGE_1 : RAW_TX_PAGE_2 });
      }
      return jsonRes({}, 404);
    };
    const result = await hydrateFromApi(fetchImpl, recordingStore().store);
    expect(result.loaded).toEqual({ accounts: 4, categories: 2, transactions: 5 });
  });

  it("throws on {success:false}", async () => {
    const fetchImpl = async () => jsonRes({ success: false, error: "nope" });
    await expect(hydrateFromApi(fetchImpl, recordingStore().store)).rejects.toBeInstanceOf(HydrateError);
  });

  it("throws HydrateError with the HTTP status on a failed request", async () => {
    const fetchImpl = async () => jsonRes({ error: "boom" }, 500);
    const err = await hydrateFromApi(fetchImpl, recordingStore().store).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HydrateError);
    expect((err as HydrateError).status).toBe(500);
  });

  it("throws on an unexpected top-level shape instead of hydrating nothing", async () => {
    const fetchImpl = async (url: string) => (url.startsWith("/api/accounts") ? jsonRes({ nope: true }) : jsonRes([]));
    await expect(hydrateFromApi(fetchImpl, recordingStore().store)).rejects.toThrow(/unexpected response shape/);
  });

  it("stops and throws when the cursor repeats instead of looping forever", async () => {
    const loop = { data: [], nextCursor: "same", hasMore: true };
    const fetchImpl = async (url: string) => {
      if (url.startsWith("/api/accounts")) return jsonRes([]);
      if (url.startsWith("/api/categories")) return jsonRes([]);
      return jsonRes(loop);
    };
    await expect(hydrateFromApi(fetchImpl, recordingStore().store)).rejects.toThrow(/cursor repeated/);
  });

  it("stops after the page with hasMore=false even if nextCursor is set", async () => {
    const api = fakeApi({ pages: [{ data: [], nextCursor: "cursor-2", hasMore: false }, RAW_TX_PAGE_2] });
    const result = await hydrateFromApi(api.fetchImpl, recordingStore().store);
    expect(result.pages).toBe(1);
  });

  it("upserts in batches of at most 500 rows", async () => {
    const big = Array.from({ length: 1201 }, (_, i) => ({ id: 1000 + i, date: "2026-01-01", accountId: 1, amount: 1 }));
    const api = fakeApi({ accounts: [], categories: [], pages: [{ data: big.slice(0, 600), nextCursor: "cursor-2", hasMore: true }, { data: big.slice(600), nextCursor: null, hasMore: false }] });
    const { store, calls } = recordingStore();
    const result = await hydrateFromApi(api.fetchImpl, store);
    expect(result.loaded.transactions).toBe(1201);
    const txSizes = calls.filter((c) => c.table === "transactions").map((c) => c.size);
    expect(Math.max(...txSizes)).toBeLessThanOrEqual(HYDRATE_BATCH);
    expect(txSizes.reduce((a, b) => a + b, 0)).toBe(1201);
  });

  it("returns zero counts for an empty account with no rows", async () => {
    const api = fakeApi({ accounts: [], categories: [], pages: [{ data: [], nextCursor: null, hasMore: false }] });
    const result = await hydrateFromApi(api.fetchImpl, recordingStore().store);
    expect(result).toEqual({ loaded: { accounts: 0, categories: 0, transactions: 0 }, skipped: { accounts: 0, categories: 0, transactions: 0 }, pages: 1 });
  });
});
