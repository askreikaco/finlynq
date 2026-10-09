/**
 * GET /api/transactions paging and server-side text filtering (plan P4).
 *
 * Cursor mode (a `cursor` param; empty = first page) returns
 * { data, nextCursor, hasMore, total? } with total on the first page only.
 * Legacy mode (no `cursor` param) keeps exactly { data, total }.
 * Text filters resolve to id sets (resolveTextFilterIds and friends) and are
 * pushed into SQL. Oracle parity runs the P1 client oracle over the fixture.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getTransactions: vi.fn(),
  getTransactionCount: vi.fn(),
  getTransactionsPage: vi.fn(),
  checkETag: vi.fn(),
  resolveTextFilterIds: vi.fn(),
  resolveAccountTextIds: vi.fn(),
  resolveHoldingTextIds: vi.fn(),
}));

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(async () => ({ authenticated: false })),
}));

vi.mock("@/lib/queries", () => ({
  getTransactions: (...args: unknown[]) => m.getTransactions(...args),
  getTransactionCount: (...args: unknown[]) => m.getTransactionCount(...args),
  getTransactionsPage: (...args: unknown[]) => m.getTransactionsPage(...args),
  getAccountById: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

vi.mock("@/lib/transactions/text-filter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/transactions/text-filter")>();
  return {
    ...actual,
    resolveTextFilterIds: (...args: unknown[]) => m.resolveTextFilterIds(...args),
    resolveAccountTextIds: (...args: unknown[]) => m.resolveAccountTextIds(...args),
    resolveHoldingTextIds: (...args: unknown[]) => m.resolveHoldingTextIds(...args),
  };
});

vi.mock("@/lib/data-version", () => ({
  checkETag: (...args: unknown[]) => m.checkETag(...args),
  withEtagHeaders: (response: unknown) => response,
  getDataVersion: vi.fn(async () => 7),
}));

vi.mock("@/lib/verify-ownership", () => ({
  verifyOwnership: vi.fn(async () => undefined),
  OwnershipError: class OwnershipError extends Error {},
}));

import { GET } from "@/app/api/transactions/route";
import { createMockRequest, parseResponse } from "../helpers/api-test-utils";
import { encodeCursor, InvalidCursorError } from "@/lib/transactions/cursor";
import { matchTxText, type TxTextRow } from "@/lib/transactions/text-filter";
import { buildTxPagingFixture, FIXTURE_ACCOUNTS } from "../helpers/tx-paging-fixture";
import { oracleFilterSort } from "../helpers/tx-client-oracle";
import { SCENARIOS, EXPECTED_DIVERGENCES, type TxScenario } from "../helpers/tx-paging-scenarios";

const FIXTURE = buildTxPagingFixture();
const DEK = Buffer.alloc(32, 0xaa);
const AUTH = {
  userId: "default",
  method: "passphrase" as const,
  mfaVerified: false,
  dek: DEK as Buffer | null,
  sessionId: "test-session-jti",
};
const VALID_CURSOR = encodeCursor({ v: 1, s: "date", d: "desc", k: "2026-01-05", id: 1000 });

function setDefaults() {
  m.checkETag.mockImplementation(async () => ({ authContext: { ...AUTH }, dataVersion: 7 }));
  m.getTransactions.mockImplementation(async (_u: string, f: { ids?: number[]; offset?: number; limit?: number } | undefined) => {
    let rows = FIXTURE;
    if (f?.ids) rows = rows.filter((r) => f.ids!.includes(r.id));
    const off = f?.offset ?? 0;
    return rows.slice(off, off + (f?.limit ?? 100)).map((r) => ({ ...r }));
  });
  m.getTransactionCount.mockImplementation(async () => FIXTURE.length);
  m.getTransactionsPage.mockImplementation(async () => ({
    rows: FIXTURE.slice(0, 2).map((r) => ({ ...r })),
    nextCursor: null,
    hasMore: false,
  }));
  m.resolveTextFilterIds.mockImplementation(async (args: { needles: Record<string, string | null | undefined>; dek: Buffer | null }) =>
    FIXTURE.filter((r) =>
      matchTxText(r as unknown as TxTextRow, { ...args.needles, hasDek: !!args.dek }),
    ).map((r) => r.id),
  );
  m.resolveAccountTextIds.mockImplementation(async (args: { needle: string; fields?: string[] }) => {
    const n = args.needle.toLowerCase().trim();
    const fields = args.fields ?? ["name", "alias"];
    return FIXTURE_ACCOUNTS.filter(
      (a) =>
        (fields.includes("name") && a.name.toLowerCase().includes(n)) ||
        (fields.includes("alias") && (a.alias ?? "").toLowerCase().includes(n) && !!a.alias),
    ).map((a) => a.id);
  });
  m.resolveHoldingTextIds.mockImplementation(async () => []);
}

async function get(qs: string) {
  const res = await GET(createMockRequest(`http://localhost:3000/api/transactions?${qs}`));
  return parseResponse(res);
}

/** Text-only scenarios (search / tag / payee / note / tags) as a query string. */
function scenarioToQuery(s: TxScenario): string | null {
  const p = new URLSearchParams({ limit: "1000" });
  const keys = Object.keys(s.filters);
  if (keys.some((k) => k !== "search" && k !== "tag")) return null;
  if (s.filters.search) p.set("search", s.filters.search);
  if (s.filters.tag) p.set("tag", s.filters.tag);
  for (const c of (s.colFilters ?? []) as unknown as Array<{ type?: string; columnId?: string; value?: string }>) {
    if (c.type !== "text" || !["payee", "note", "tags"].includes(c.columnId ?? "")) return null;
    p.set(`filter_${c.columnId}`, c.value ?? "");
  }
  if (!s.filters.search && !s.filters.tag && !(s.colFilters ?? []).length) return null;
  return `${p.toString()}`;
}

const sortedIds = (xs: Array<{ id: number }>) => xs.map((x) => x.id).sort((a, b) => a - b);

describe("GET /api/transactions - cursor mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
  });

  it("first page (empty cursor) uses limit 50 and carries total", async () => {
    m.getTransactionsPage.mockResolvedValueOnce({ rows: [], nextCursor: null, hasMore: false });
    const { status, data } = await get("cursor=&sort=amount");
    expect(status).toBe(200);
    expect(m.getTransactionsPage).toHaveBeenCalledWith("default", expect.objectContaining({ sortColumnId: "amount" }), 50);
    expect(data).toEqual({ data: [], nextCursor: null, hasMore: false, total: FIXTURE.length });
    expect(m.getTransactionCount).toHaveBeenCalledTimes(1);
  });

  it("later page: decodes the cursor, returns no total key and no count query", async () => {
    m.getTransactionsPage.mockResolvedValueOnce({ rows: [], nextCursor: null, hasMore: false });
    const { status, data } = await get(`cursor=${VALID_CURSOR}`);
    expect(status).toBe(200);
    expect(m.getTransactionsPage).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ cursor: expect.objectContaining({ k: "2026-01-05", id: 1000 }) }),
      50,
    );
    expect(data).not.toHaveProperty("total");
    expect(Object.keys(data as object).sort()).toEqual(["data", "hasMore", "nextCursor"]);
    expect(m.getTransactionCount).not.toHaveBeenCalled();
  });

  it("clamps limit to 1..200 and falls back to 50 for a non-numeric limit", async () => {
    await get("cursor=&limit=500");
    await get("cursor=&limit=0");
    await get("cursor=&limit=abc");
    await get("cursor=&limit=7");
    const limits = m.getTransactionsPage.mock.calls.map((c) => c[2]);
    expect(limits).toEqual([200, 1, 50, 7]);
  });

  it("passes hasMore and nextCursor from the page result through unchanged", async () => {
    m.getTransactionsPage.mockResolvedValueOnce({
      rows: FIXTURE.slice(0, 2),
      nextCursor: "NEXT_CURSOR_VALUE",
      hasMore: true,
    });
    const { data } = await get("cursor=&limit=2");
    const body = data as { data: unknown[]; nextCursor: string; hasMore: boolean };
    expect(body.data).toHaveLength(2);
    expect(body.nextCursor).toBe("NEXT_CURSOR_VALUE");
    expect(body.hasMore).toBe(true);
  });

  it("returns 400 Invalid cursor for a malformed cursor and never queries", async () => {
    const { status, data } = await get("cursor=not_a_cursor!!");
    expect(status).toBe(400);
    expect(data).toEqual({ error: "Invalid cursor" });
    expect(m.getTransactionsPage).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid cursor when the cursor sort does not match the request", async () => {
    const amountCursor = encodeCursor({ v: 1, s: "amount", d: "desc", k: -45, id: 1000 });
    const { status, data } = await get(`cursor=${amountCursor}&sort=date`);
    expect(status).toBe(400);
    expect(data).toEqual({ error: "Invalid cursor" });
  });

  it("returns 400 Invalid cursor when the query layer rejects the cursor", async () => {
    m.getTransactionsPage.mockRejectedValueOnce(new InvalidCursorError());
    const { status, data } = await get(`cursor=${VALID_CURSOR}`);
    expect(status).toBe(400);
    expect(data).toEqual({ error: "Invalid cursor" });
  });

  it("invalid id keeps the empty early return with nextCursor null and hasMore false", async () => {
    const first = await get("cursor=&id=abc");
    expect(first.data).toEqual({ data: [], total: 0, nextCursor: null, hasMore: false });
    const later = await get(`cursor=${VALID_CURSOR}&id=abc`);
    expect(later.data).toEqual({ data: [], nextCursor: null, hasMore: false });
    expect(m.getTransactionsPage).not.toHaveBeenCalled();
  });

  it("locked session (no DEK) never returns ciphertext in cursor mode", async () => {
    m.checkETag.mockImplementation(async () => ({ authContext: { ...AUTH, dek: null }, dataVersion: 7 }));
    m.getTransactionsPage.mockResolvedValueOnce({
      rows: [{ ...FIXTURE[0], payee: "v1:AAAA:BBBB:CCCC" }],
      nextCursor: null,
      hasMore: false,
    });
    const { data } = await get("cursor=");
    const row = (data as { data: Array<{ payee: unknown }> }).data[0];
    expect(row.payee).toBeNull();
  });
});

describe("GET /api/transactions - legacy mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
  });

  it("returns exactly { data, total } with limit/offset and total on every call", async () => {
    const first = await get("limit=5&offset=10");
    expect(m.getTransactions).toHaveBeenLastCalledWith("default", expect.objectContaining({ limit: 5, offset: 10 }));
    expect(Object.keys(first.data as object).sort()).toEqual(["data", "total"]);
    expect(first.data).toEqual({ data: expect.any(Array), total: FIXTURE.length });

    const second = await get("limit=5&offset=0");
    expect(Object.keys(second.data as object).sort()).toEqual(["data", "total"]);
    expect(m.getTransactionsPage).not.toHaveBeenCalled();
  });

  it("does not switch to cursor mode without the cursor param", async () => {
    await get("limit=50&offset=0");
    expect(m.getTransactionsPage).not.toHaveBeenCalled();
    expect(m.getTransactions).toHaveBeenCalledWith("default", expect.objectContaining({ limit: 50 }));
  });
});

describe("GET /api/transactions - text filters as id sets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
  });

  it("search resolves ids with the ETag data_version and pushes them, no limit:1000", async () => {
    m.resolveTextFilterIds.mockResolvedValueOnce([1000, 1002]);
    const { data } = await get("search=metro");
    expect(m.resolveTextFilterIds).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "default",
        needles: expect.objectContaining({ search: "metro" }),
        dataVersion: 7,
      }),
    );
    const f = m.getTransactions.mock.calls[0][1];
    expect(f.ids).toEqual([1000, 1002]);
    expect(f.limit).toBe(100);
    expect(f.limit).not.toBe(1000);
    expect((data as { total: number }).total).toBe(2);
  });

  it("legacy text total is the id-set size, not a capped page length", async () => {
    m.resolveTextFilterIds.mockResolvedValueOnce(Array.from({ length: 1500 }, (_, i) => 1000 + (i % 240)));
    const { data } = await get("filter_payee=metro");
    expect((data as { total: number }).total).toBe(1500);
  });

  it("an empty resolver result pushes ids [] and never an empty accountIds or portfolioHoldingIds", async () => {
    m.resolveTextFilterIds.mockResolvedValueOnce([]);
    const { data } = await get("tag=nope");
    const f = m.getTransactions.mock.calls[0][1];
    expect(f.ids).toEqual([]);
    expect(f.accountIds).toBeUndefined();
    expect(f.portfolioHoldingIds).toBeUndefined();
    expect(data).toEqual({ data: [], total: 0 });
  });

  it("filter_accountName resolves to accountIds on name only", async () => {
    m.resolveAccountTextIds.mockResolvedValueOnce([1]);
    await get("filter_accountName=chequ");
    expect(m.resolveAccountTextIds).toHaveBeenCalledWith(
      expect.objectContaining({ needle: "chequ", fields: ["name"] }),
    );
    expect(m.getTransactions.mock.calls[0][1].accountIds).toEqual([1]);
  });

  it("filter_accountAlias resolves on alias only; filter_account on name and alias", async () => {
    await get("filter_accountAlias=BRK");
    expect(m.resolveAccountTextIds).toHaveBeenLastCalledWith(expect.objectContaining({ fields: ["alias"] }));
    await get("filter_account=sav");
    expect(m.resolveAccountTextIds).toHaveBeenLastCalledWith(expect.objectContaining({ fields: ["name", "alias"] }));
  });

  it("an empty account resolution pushes ids [] (match nothing)", async () => {
    m.resolveAccountTextIds.mockResolvedValueOnce([]);
    const { data } = await get("filter_account=zzz");
    const f = m.getTransactions.mock.calls[0][1];
    expect(f.ids).toEqual([]);
    expect(f.accountIds).toBeUndefined();
    expect(data).toEqual({ data: [], total: 0 });
  });

  it("filter_portfolio resolves to portfolioHoldingIds; empty resolution matches nothing", async () => {
    m.resolveHoldingTextIds.mockResolvedValueOnce([4]);
    await get("filter_portfolio=vanguard");
    expect(m.resolveHoldingTextIds).toHaveBeenCalledWith(expect.objectContaining({ needle: "vanguard" }));
    expect(m.getTransactions.mock.calls[0][1].portfolioHoldingIds).toEqual([4]);

    m.resolveHoldingTextIds.mockResolvedValueOnce([]);
    m.getTransactions.mockClear();
    await get("filter_portfolio=none");
    const f = m.getTransactions.mock.calls[0][1];
    expect(f.ids).toEqual([]);
    expect(f.portfolioHoldingIds).toBeUndefined();
  });

  it("filter_kind is a plaintext ILIKE with LIKE metacharacters escaped", async () => {
    await get("filter_kind=buy_");
    expect(m.getTransactions.mock.calls[0][1].kindLike).toBe("%buy\\_%");
  });

  it("comma accountId maps to accountIds; a single id keeps the accountId field", async () => {
    await get("accountId=1,3");
    const comma = m.getTransactions.mock.calls[0][1];
    expect(comma.accountIds).toEqual([1, 3]);
    expect(comma.accountId).toBeUndefined();

    m.getTransactions.mockClear();
    await get("accountId=2");
    const single = m.getTransactions.mock.calls[0][1];
    expect(single.accountId).toBe(2);
    expect(single.accountIds).toBeUndefined();
  });

  it("comma categoryId maps to categoryIds", async () => {
    await get("categoryId=10,12");
    expect(m.getTransactions.mock.calls[0][1].categoryIds).toEqual([10, 12]);
  });

  it("cursor mode with a text filter pushes ids and takes total from the id set on the first page", async () => {
    m.resolveTextFilterIds.mockResolvedValueOnce([1000, 1002]);
    m.getTransactionsPage.mockResolvedValueOnce({ rows: [], nextCursor: null, hasMore: false });
    const { data } = await get("cursor=&search=x");
    expect(m.getTransactionsPage).toHaveBeenCalledWith("default", expect.objectContaining({ ids: [1000, 1002] }), 50);
    expect(data).toEqual({ data: [], nextCursor: null, hasMore: false, total: 2 });
    expect(m.getTransactionCount).not.toHaveBeenCalled();
  });

  it("tag is an exact token match, so a substring tag matches nothing (2.5 b)", async () => {
    const { data } = await get("tag=fee");
    expect((data as { data: unknown[] }).data).toEqual([]);
  });
});

describe("oracle parity for text scenarios (P1 oracle, EXPECTED_DIVERGENCES skipped)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
  });

  const divergent = new Set(EXPECTED_DIVERGENCES.flatMap((d) => d.scenarios));
  const cases = SCENARIOS.filter((s) => !divergent.has(s.id) && scenarioToQuery(s) !== null);

  it("has text scenarios to compare, and most return rows (not vacuous)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
    const nonEmpty = cases.filter((s) => oracleFilterSort(FIXTURE, s.filters, s.sortPref, s.colFilters).length > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(6);
  });

  it.each(cases.map((s) => [s.id, s] as const))("%s matches the client oracle id set", async (_id, s) => {
    const query = scenarioToQuery(s)!;
    const { data } = await get(query);
    const routeIds = sortedIds((data as { data: Array<{ id: number }> }).data);
    const oracleIds = sortedIds(oracleFilterSort(FIXTURE, s.filters, s.sortPref, s.colFilters));
    expect(routeIds).toEqual(oracleIds);
  });
});
