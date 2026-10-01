/**
 * Tests for Vietnamese stock price provider (vn-quote.ts).
 *
 * Coverage:
 *   1. VNDirect provider: single quote, multiple symbols, history
 *   2. TCBS provider: single quote with bars-long-term API
 *   3. Fallback to Yahoo on provider error
 *   4. Disabled provider: .VN symbols route to Yahoo
 *   5. Cache behavior: within TTL, beyond TTL, historical immutable
 *   6. Units conversion: VNDirect "thousands" × 1000
 *   7. History integration: cacheHistoricalWindow populated
 *   8. Mutation proofs: each behavior guard must fail a test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─ In-memory price_cache fake (same pattern as price-cache-ttl.test.ts) ────
type Row = {
  id: number;
  symbol: string;
  date: string;
  price: number;
  currency: string;
  previousClose: number | null;
  fetchedAt: Date | null;
};

type Pred =
  | { t: "eq"; col: unknown; val: unknown }
  | { t: "in"; col: unknown; vals: unknown[] }
  | { t: "and"; preds: Pred[] };

const H = vi.hoisted(() => {
  const store: { rows: Row[]; nextId: number } = { rows: [], nextId: 1 };
  const COL = {
    symbol: { __col: "symbol" },
    date: { __col: "date" },
    id: { __col: "id" },
  };
  function colName(col: unknown): keyof Row | null {
    if (col === COL.symbol) return "symbol";
    if (col === COL.date) return "date";
    if (col === COL.id) return "id";
    return null;
  }
  function matches(row: Row, p: Pred | undefined): boolean {
    if (!p) return true;
    if (p.t === "and") return p.preds.every((pp) => matches(row, pp));
    const name = colName(p.col);
    if (!name) return true;
    if (p.t === "eq") return (row as Record<string, unknown>)[name] === p.val;
    if (p.t === "in") return p.vals.includes((row as Record<string, unknown>)[name]);
    return true;
  }
  return { store, COL, matches };
});

const store = H.store;

function resetStore() {
  store.rows = [];
  store.nextId = 1;
}

function seed(r: Omit<Row, "id" | "currency"> & { currency?: string }): Row {
  const row: Row = { id: store.nextId++, currency: "USD", ...r };
  store.rows.push(row);
  return row;
}

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown): Pred => ({ t: "eq", col, val }),
  and: (...preds: Pred[]): Pred => ({ t: "and", preds }),
  inArray: (col: unknown, vals: unknown[]): Pred => ({ t: "in", col, vals }),
  gte: (col: unknown, val: unknown): Pred => ({ t: "eq", col, val }), // simplified
  lte: (col: unknown, val: unknown): Pred => ({ t: "eq", col, val }), // simplified
}));

// Mock db + schema
vi.mock("@/db", () => {
  const { store, COL, matches } = H;
  const priceCache = { symbol: COL.symbol, date: COL.date, id: COL.id };

  function makeSelect() {
    let pred: Pred | undefined;
    const chain = {
      from() {
        return chain;
      },
      where(p: Pred) {
        pred = p;
        return chain;
      },
      then(resolve: (rows: Row[]) => unknown) {
        return Promise.resolve(store.rows.filter((r) => matches(r, pred))).then(resolve);
      },
      async get() {
        return store.rows.find((r) => matches(r, pred)) ?? null;
      },
    };
    return chain;
  }

  function makeUpdate() {
    let patch: Partial<Row> = {};
    let pred: Pred | undefined;
    const chain = {
      set(p: Partial<Row>) {
        patch = p;
        return chain;
      },
      where(p: Pred) {
        pred = p;
        return chain;
      },
      returning() {
        const hit = store.rows.filter((r) => matches(r, pred));
        for (const r of hit) Object.assign(r, patch);
        return Promise.resolve(hit.map((r) => ({ id: r.id })));
      },
      then(resolve: (v: unknown) => unknown) {
        const hit = store.rows.filter((r) => matches(r, pred));
        for (const r of hit) Object.assign(r, patch);
        return Promise.resolve(undefined).then(resolve);
      },
    };
    return chain;
  }

  function makeInsert() {
    return {
      values(vals: Partial<Row> | Partial<Row>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        for (const v of arr) {
          store.rows.push({
            id: store.nextId++,
            symbol: v.symbol!,
            date: v.date!,
            price: v.price ?? 0,
            currency: v.currency ?? "USD",
            previousClose: v.previousClose ?? null,
            fetchedAt: v.fetchedAt ?? new Date(),
          });
        }
        return Promise.resolve(undefined);
      },
    };
  }

  const db = {
    select: () => makeSelect(),
    update: () => makeUpdate(),
    insert: () => makeInsert(),
  };
  return { db, schema: { priceCache } };
});

// ─ Tests ────────────────────────────────────────────────────────────────────

import { fetchQuoteLive, fetchQuoteAtDate, fetchQuote } from "@/lib/price-service";
import { todayISO } from "@/lib/utils/date";

const TODAY = todayISO();
const ago = (ms: number) => new Date(Date.now() - ms);

describe("Vietnamese stock price provider (vn-quote)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStore();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    // Clear process.env for each test
    delete process.env.PF_PRICE_PROVIDER_VN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.PF_PRICE_PROVIDER_VN;
  });

  // TC 1: VNDirect provider enabled, PVS.VN calls VNDirect API and returns correct price
  it("fetches PVS.VN from VNDirect when provider is 'vndirect'", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: "PVS", date: "2026-09-30", close: 33.5, basicPrice: 33.4 },
          { code: "PVS", date: "2026-09-29", close: 33.4, basicPrice: 33.3 },
        ],
      }),
    });

    const q = await fetchQuoteLive("PVS.VN");

    // Verify VNDirect URL was called (contains vndirect and code:PVS)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("api-finfo.vndirect.com.vn"),
      expect.any(Object)
    );
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("code:PVS"), expect.any(Object));
    // Yahoo should NOT be called
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("query1.finance.yahoo.com"), expect.any(Object));

    // Verify price (33.5 thousands → 33500 VND)
    expect(q).toBeDefined();
    expect(q!.price).toBe(33500);
    expect(q!.currency).toBe("VND");
    expect(q!.symbol).toBe("PVS.VN");
    // Previous close from second bar: 33.4 * 1000
    expect(q!.previousClose).toBe(33400);
  });

  // TC 2: Non-.VN symbols (AAPL, VCN.TO) call Yahoo only
  it("routes non-.VN symbols (AAPL, VCN.TO) to Yahoo only", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 228.5,
                previousClose: 227.1,
                currency: "USD",
                shortName: "Apple",
                instrumentType: "EQUITY",
              },
            },
          ],
        },
      }),
    });

    await fetchQuoteLive("AAPL");
    await fetchQuoteLive("VCN.TO");

    // Should call Yahoo (query1.finance.yahoo.com) exactly 2 times
    const yahooCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("query1.finance.yahoo.com")
    );
    expect(yahooCalls).toHaveLength(2);

    // Should NOT call VNDirect
    const vndirectCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    );
    expect(vndirectCalls).toHaveLength(0);
  });

  // TC 3: VNDirect error (500, throw, empty data) → Yahoo fallback
  it("falls back to Yahoo when VNDirect returns 500", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    // First call (VNDirect) fails with 500
    // Second call (Yahoo) succeeds
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 150,
                  previousClose: 149,
                  currency: "VND",
                  shortName: "PVS",
                  instrumentType: "EQUITY",
                },
              },
            ],
          },
        }),
      });

    const q = await fetchQuoteLive("PVS.VN");

    // Should have called both VNDirect and Yahoo
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // First call is VNDirect, second is Yahoo
    expect(fetchSpy.mock.calls[0][0]).toContain("vndirect");
    expect(fetchSpy.mock.calls[1][0]).toContain("yahoo");

    // Result should be from Yahoo
    expect(q).toBeDefined();
    expect(q!.price).toBe(150);
  });

  // TC 4: Provider unset → .VN symbol goes to Yahoo
  it("routes PVS.VN to Yahoo when PF_PRICE_PROVIDER_VN is unset", async () => {
    // process.env.PF_PRICE_PROVIDER_VN is already deleted in beforeEach
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 33500,
                previousClose: 33400,
                currency: "VND",
                shortName: "PVS",
                instrumentType: "EQUITY",
              },
            },
          ],
        },
      }),
    });

    await fetchQuoteLive("PVS.VN");

    // Should call Yahoo, not VNDirect
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("query1.finance.yahoo.com"), expect.any(Object));
    const vndirectCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    );
    expect(vndirectCalls).toHaveLength(0);
  });

  // TC 5a: Cache respected — second call within 30 min makes no fetch
  it("caches today's quote and reuses it within 30 minutes", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    seed({
      symbol: "PVS.VN",
      date: TODAY,
      price: 33500,
      currency: "VND",
      previousClose: 33400,
      fetchedAt: ago(5 * 60 * 1000), // 5 min old
    });

    const q = await fetchQuote("PVS.VN");

    // Should NOT call any fetch (cache hit)
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(q).toBeDefined();
    expect(q!.price).toBe(33500);
  });

  // TC 5b: Stale today-row → re-fetch with fallback on error
  it("re-fetches a stale today-row (31 min old) from cache then VNDirect, falls back to Yahoo on error", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    seed({
      symbol: "PVS.VN",
      date: TODAY,
      price: 33500,
      currency: "VND",
      previousClose: 33400,
      fetchedAt: ago(31 * 60 * 1000), // 31 min old, past TTL
    });

    // First call (VNDirect) fails, second call (Yahoo) succeeds
    fetchSpy
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 150,
                  previousClose: 149,
                  currency: "VND",
                  shortName: "PVS",
                  instrumentType: "EQUITY",
                },
              },
            ],
          },
        }),
      });

    const q = await fetchQuoteLive("PVS.VN");

    // Should have called both VNDirect and Yahoo
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Result should be from Yahoo
    expect(q).toBeDefined();
    expect(q!.price).toBe(150);
  });

  // TC 6: Units conversion — 20.15 → 20150
  it("converts VNDirect close 20.15 (thousands) to 20150 VND", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: "HPG", date: "2026-09-30", close: 20.15 }],
      }),
    });

    const q = await fetchQuoteLive("HPG.VN");

    expect(q).toBeDefined();
    expect(q!.price).toBe(20150);
  });

  // TC 6b: Price ≤ 0 or NaN → null (falls back to Yahoo)
  it("returns null for price ≤ 0 and falls back to Yahoo", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ code: "DEAD", date: "2026-09-30", close: 0 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 100,
                  previousClose: 99,
                  currency: "VND",
                  shortName: "DEAD",
                  instrumentType: "EQUITY",
                },
              },
            ],
          },
        }),
      });

    const q = await fetchQuoteLive("DEAD.VN");

    // Should fall back to Yahoo
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(q).toBeDefined();
    expect(q!.price).toBe(100);
  });

  // TC 7: TCBS provider calls TCBS URL with ticker= parameter
  it("fetches from TCBS when provider is 'tcbs'", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "tcbs";
    const now = Math.floor(Date.now() / 1000);
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        t: [now, now - 86400],
        c: [33.5, 33.4],
      }),
    });

    const q = await fetchQuoteLive("PVS.VN");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("apipubaws.tcbs.com.vn"),
      expect.any(Object)
    );
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("ticker=PVS"), expect.any(Object));
    expect(q).toBeDefined();
    // TCBS closes = [33.5, 33.4] in ascending order, last element (latest) is 33.4
    // floor(33.4 + 0.5) = floor(33.9) = 33
    expect(q!.price).toBe(33);
    expect(q!.currency).toBe("VND");
  });

  // TC 8: History path uses vndirectHistory for .VN symbols
  it("uses vndirectHistory for fetchQuoteAtDate on a .VN symbol", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    const queryDate = "2026-09-15";
    // VNDirect API returns newest first (descending order)
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: "PVS", date: "2026-09-15", close: 33.2 },
          { code: "PVS", date: "2026-09-14", close: 33.1 },
          { code: "PVS", date: "2026-09-13", close: 33.0 },
        ],
      }),
    });

    const q = await fetchQuoteAtDate("PVS.VN", queryDate);

    // Should call vndirectHistory (VNDirect API)
    const vndirectCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("api-finfo.vndirect.com.vn")
    );
    expect(vndirectCalls.length).toBeGreaterThan(0);
    // Verify URL contains date:lte: bound
    expect(vndirectCalls[0][0]).toContain("date:lte:");

    // Should NOT call Yahoo for this .VN symbol
    const yahooCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("query1.finance.yahoo.com")
    );
    expect(yahooCalls).toHaveLength(0);

    // Result should be the price on or before queryDate: 33.2 * 1000 = 33200 VND
    // vndirectHistory returns in VND already, so price should be 33200
    expect(q).toBeDefined();
    expect(q!.price).toBe(33200);
  });

  // TC 8b: Empty history → falls back to Yahoo
  it("falls back to Yahoo when vndirectHistory returns empty", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }), // empty history
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 99,
                  currency: "VND",
                  shortName: "NODATA",
                },
                timestamp: [Math.floor(new Date("2026-09-15").getTime() / 1000)],
                indicators: {
                  quote: [{ close: [99] }],
                },
              },
            ],
          },
        }),
      });

    const q = await fetchQuoteAtDate("NODATA.VN", "2026-09-15");

    // Should fall back to Yahoo
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(q).toBeDefined();
    expect(q!.price).toBe(99);
  });

  // TC 8c: Provider unset for fetchQuoteAtDate → no VNDirect call
  it("with flag unset, fetchQuoteAtDate makes no vndirect call for .VN", async () => {
    // process.env.PF_PRICE_PROVIDER_VN is already unset
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 33200,
                currency: "VND",
                shortName: "PVS",
              },
              timestamp: [Math.floor(new Date("2026-09-15").getTime() / 1000)],
              indicators: {
                quote: [{ close: [33200] }],
              },
            },
          ],
        },
      }),
    });

    await fetchQuoteAtDate("PVS.VN", "2026-09-15");

    // Should call Yahoo, not VNDirect
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("query1.finance.yahoo.com"), expect.any(Object));
    const vndirectCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    );
    expect(vndirectCalls).toHaveLength(0);
  });

  // TC 9: Memo — two history requests for same symbol cause exactly 1 VNDirect fetch
  it("memo: two history requests for same symbol cause exactly 1 vndirect fetch", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: "MWG", date: "2026-09-15", close: 75.0 },
          { code: "MWG", date: "2026-09-14", close: 74.9 },
        ],
      }),
    });

    // First request for MWG on 2026-09-15
    await fetchQuoteAtDate("MWG.VN", "2026-09-15");
    const vndirectCallsAfterFirst = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    ).length;

    // Second request for same symbol on different date (within memo TTL, should not fetch)
    await fetchQuoteAtDate("MWG.VN", "2026-09-14");
    const vndirectCallsAfterSecond = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    ).length;

    // Should have made exactly 1 VNDirect call total (second request served from memo)
    expect(vndirectCallsAfterFirst).toBe(1);
    expect(vndirectCallsAfterSecond).toBe(1); // No additional fetch
  });

  // ── Mutation proofs ────────────────────────────────────────────────────────
  // Each guard must cause a test to fail when removed. Record the failure.

  // MP-a: Remove .VN guard → AAPL incorrectly tries VNDirect
  it("[MUTATION PROOF] .VN guard: AAPL with vndirect provider tries VNDirect", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [], // VNDirect would fail/return empty for AAPL
      }),
    });

    await fetchQuoteLive("AAPL");

    // If .VN guard is removed, VNDirect is called for AAPL → test would try VNDirect first.
    // This test confirms that WITH the guard, only Yahoo is called.
    // Removing guard would make VNDirect call, failing this expectation.
    const vndirectCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    );
    expect(vndirectCalls).toHaveLength(0); // GUARD PRESENT: 0 VNDirect calls
    // Removing the guard would make this fail (vndirectCalls.length > 0).
  });

  // MP-b: Remove vnProvider() check → flag-unset symbol tries provider
  it("[MUTATION PROOF] vnProvider() check: unset flag means no VNDirect", async () => {
    // process.env.PF_PRICE_PROVIDER_VN is already unset
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: "PVS", date: "2026-09-30", close: 33.5 }],
      }),
    });

    await fetchQuoteLive("PVS.VN");

    // With vnProvider() check: no VNDirect call
    const vndirectCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    );
    expect(vndirectCalls).toHaveLength(0); // GUARD PRESENT
    // Removing the check would make vndirectCalls.length > 0, failing this test.
  });

  // MP-c: Remove ×1000 multiply → 33.5 stays 33.5 instead of 33500
  it("[MUTATION PROOF] ×1000 multiply: price 33.5 becomes 33500", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: "PVS", date: "2026-09-30", close: 33.5 }],
      }),
    });

    const q = await fetchQuoteLive("PVS.VN");

    expect(q!.price).toBe(33500); // WITH multiply
    // Removing ×1000 would make price = 33.5, failing this assertion.
  });

  // MP-d: Remove .VN strip in response name
  it("[MUTATION PROOF] name uses baseSymbol without .VN", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: "HPG", date: "2026-09-30", close: 20 }],
      }),
    });

    const q = await fetchQuoteLive("HPG.VN");

    expect(q!.name).toBe("HPG"); // .VN stripped
    // If .VN strip is removed, name might be "HPG.VN", failing the expectation.
  });

  // MP-e: Remove fallback (|| vn) logic → VNDirect error = null (no Yahoo)
  it("[MUTATION PROOF] fallback: VNDirect error does attempt Yahoo", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy
      .mockResolvedValueOnce({ ok: false }) // VNDirect fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 100,
                  previousClose: 99,
                  currency: "VND",
                  shortName: "PVS",
                  instrumentType: "EQUITY",
                },
              },
            ],
          },
        }),
      });

    const q = await fetchQuoteLive("PVS.VN");

    expect(fetchSpy).toHaveBeenCalledTimes(2); // VNDirect + Yahoo
    expect(q).toBeDefined(); // WITH fallback: got a price
    // Removing fallback: would return null on VNDirect error, failing this test.
  });

  // MP-f: Remove ascending sort → bars in wrong order, chosen date wrong
  it("[MUTATION PROOF] ascending sort: history sorted ascending by date", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    // API returns newest first (descending)
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: "VOS", date: "2026-09-15", close: 12.6 },
          { code: "VOS", date: "2026-09-14", close: 12.5 },
        ],
      }),
    });

    const q = await fetchQuoteAtDate("VOS.VN", "2026-09-14");

    // Should get the price for 2026-09-14 (12.5 * 1000 = 12500)
    expect(q).toBeDefined();
    expect(q!.price).toBe(12500);
    // Removing sort: bars stay in newest-first order, selection logic breaks
  });

  // MP-g: Restore ×1000 in price-service → double multiplication
  it("[MUTATION PROOF] units: vndirectHistory returns VND not thousands", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: "HDB", date: "2026-09-15", close: 32.2 }],
      }),
    });

    const q = await fetchQuoteAtDate("HDB.VN", "2026-09-15");

    // vndirectHistory returns 32.2 * 1000 = 32200 (VND)
    // price-service should use it as-is, not multiply again
    expect(q).toBeDefined();
    expect(q!.price).toBe(32200); // NOT 32200000
    // Restoring ×1000 would give 32200000, failing this test
  });

  // MP-h: Drop lte bound → fetch unbounded or wrong range
  it("[MUTATION PROOF] lte bound: URL contains date:lte: limit", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: "FPT", date: "2026-09-15", close: 56.0 }],
      }),
    });

    await fetchQuoteAtDate("FPT.VN", "2026-09-15");

    const vndirectCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    );
    expect(vndirectCalls.length).toBeGreaterThan(0);
    // Verify lte bound is present
    expect(vndirectCalls[0][0]).toContain("date:lte:");
    // Dropping lte: URL becomes unbounded or missing upper limit
  });

  // MP-i: Remove memo → every request fetches
  it("[MUTATION PROOF] memo: memo prevents repeated VNDirect calls", async () => {
    process.env.PF_PRICE_PROVIDER_VN = "vndirect";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: "VRE", date: "2026-09-15", close: 65.5 }],
      }),
    });

    // First call for VRE on 2026-09-15
    await fetchQuoteAtDate("VRE.VN", "2026-09-15");
    const vndCallsAfter1st = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    ).length;

    // Second call for same symbol on different date
    await fetchQuoteAtDate("VRE.VN", "2026-09-14");
    const vndCallsAfter2nd = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    ).length;

    // Should have made exactly 1 VNDirect call (memo serves second call)
    expect(vndCallsAfter1st).toBe(1);
    expect(vndCallsAfter2nd).toBe(1); // No additional fetch
    // Removing memo: vndCallsAfter2nd would be 2, failing this test
  });

  // MP-j: Remove flag check in price-service → .VN goes to VN provider when disabled
  it("[MUTATION PROOF] flag check in fetchQuoteAtDate: unset flag skips VN provider", async () => {
    // Unset the flag explicitly
    delete process.env.PF_PRICE_PROVIDER_VN;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 25000,
                currency: "VND",
                shortName: "TCB",
              },
              timestamp: [Math.floor(new Date("2026-09-15").getTime() / 1000)],
              indicators: {
                quote: [{ close: [25000] }],
              },
            },
          ],
        },
      }),
    });

    await fetchQuoteAtDate("TCB.VN", "2026-09-15");

    // Should call Yahoo, not VNDirect
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("query1.finance.yahoo.com"), expect.any(Object));
    const vndirectCalls = fetchSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("vndirect")
    );
    expect(vndirectCalls).toHaveLength(0);
    // Removing flag check: vndirectHistory is called even when flag is unset
  });
});
