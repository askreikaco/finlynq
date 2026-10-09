/**
 * @vitest-environment jsdom
 */
// revalidateTransactionLists must refresh a mounted paged (infinite) list and
// a plain transactions key. A filter-only mutate does not reach infinite keys.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { SWRConfig, useSWRConfig } from "swr";
import useSWR from "swr";
import { useTransactions } from "@/app/(app)/transactions/_hooks/use-transactions";
import { revalidateTransactionLists } from "@/lib/transactions/revalidate";

function mkTx(id: number) {
  return {
    id, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 4, categoryName: "C",
    categoryType: "E", currency: "USD", amount: -id, enteredAmount: -id, enteredCurrency: "USD",
    payee: `p${id}`, note: "", tags: "", source: "manual", accountType: "A",
    portfolioHolding: null, portfolioHoldingSymbol: null,
  };
}

let ROWS: ReturnType<typeof mkTx>[] = [];
let calls: string[] = [];

function serve(url: string) {
  const u = new URL(url, "http://localhost");
  const limit = Number(u.searchParams.get("limit") ?? 50);
  const cursor = u.searchParams.get("cursor");
  const offset = cursor ? Number(cursor.slice(2)) : 0;
  const slice = ROWS.slice(offset, offset + limit);
  const end = offset + slice.length;
  const hasMore = end < ROWS.length;
  return { data: slice, hasMore, nextCursor: hasMore ? `o:${end}` : null, ...(cursor ? {} : { total: ROWS.length }) };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

const FILTERS = {
  id: "", startDate: "", endDate: "", accountId: "", categoryId: "", search: "",
  portfolioHolding: "", tag: "", direction: "", minAmount: "", maxAmount: "",
};

beforeEach(() => {
  ROWS = [mkTx(3), mkTx(2), mkTx(1)];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => serve(url) };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("revalidateTransactionLists", () => {
  it("refreshes a mounted paged (infinite) transactions list", async () => {
    const { result } = renderHook(
      () => {
        const list = useTransactions(FILTERS, undefined);
        const cfg = useSWRConfig();
        return { list, cfg };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.txns.length).toBe(3));

    ROWS = [mkTx(4), ...ROWS]; // a new row is created on the server
    calls = [];
    await act(async () => {
      await revalidateTransactionLists(result.current.cfg.mutate, result.current.cfg.cache);
    });
    await waitFor(() => expect(result.current.list.txns[0]?.id).toBe(4));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.startsWith("/api/transactions?"))).toBe(true);
  });

  it("refreshes a plain /api/transactions key and leaves unrelated keys alone", async () => {
    const { result } = renderHook(
      () => {
        const plain = useSWR<{ data: unknown[] }>("/api/transactions?limit=5", async (u: string) => {
          calls.push(u);
          return serve(u) as { data: unknown[] };
        });
        const other = useSWR("/api/accounts", async (u: string) => {
          calls.push(u);
          return { data: [] };
        });
        return { plain, other, cfg: useSWRConfig() };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.plain.data?.data.length).toBe(3));
    expect(result.current.other.data).toBeDefined();

    ROWS = [mkTx(9), ...ROWS];
    calls = [];
    await act(async () => {
      await revalidateTransactionLists(result.current.cfg.mutate, result.current.cfg.cache);
    });
    await waitFor(() => expect(calls).toContain("/api/transactions?limit=5"));
    expect(calls).not.toContain("/api/accounts");
    await waitFor(() => expect(result.current.plain.data?.data[0]).toMatchObject({ id: 9 }));
  });
});
