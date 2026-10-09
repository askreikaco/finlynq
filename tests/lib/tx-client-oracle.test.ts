/**
 * @vitest-environment jsdom
 */
// Self-test for the client oracle: for every scenario in the paging matrix,
// the test-only oracle (copy of the hook's filter/sort) must give the same
// row order as the REAL useTransactions hook on the same fixture. Also pins
// independent golden facts (null ordering, tie order) so a broken copy fails
// by name.
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import * as React from "react";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { SWRConfig } from "swr";
import {
  useTransactions,
  type UseTransactionsFilters,
  type UseTransactionsSortPref,
  type UseTransactionsColFilter,
} from "@/app/(app)/transactions/_hooks/use-transactions";
import type { Transaction } from "@/app/(app)/transactions/_types";
import { oracleFilterSort } from "../helpers/tx-client-oracle";
import { buildTxPagingFixture, FIXTURE_SIZE } from "../helpers/tx-paging-fixture";
import { SCENARIOS, EXPECTED_DIVERGENCES, type TxScenario } from "../helpers/tx-paging-scenarios";

const ROWS: Transaction[] = buildTxPagingFixture();

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: JSON.parse(JSON.stringify(ROWS)), total: ROWS.length }),
    })),
  );
});

afterEach(() => {
  cleanup();
});

/** Runs the real hook on the fixture and returns every filtered row id, in order. */
async function hookIds(
  filters: UseTransactionsFilters,
  sortPref?: UseTransactionsSortPref,
  colFilters?: UseTransactionsColFilter[],
): Promise<number[]> {
  const { result } = renderHook(() => useTransactions(filters, sortPref, colFilters), { wrapper });
  await waitFor(() => expect(result.current.isPartial).toBe(false));
  // Walk the local pagination until every filtered row is rendered.
  for (let guard = 0; guard < 1000 && result.current.txns.length < result.current.total; guard++) {
    act(() => {
      result.current.loadNextPage();
    });
  }
  expect(result.current.txns.length).toBe(result.current.total);
  return result.current.txns.map((t) => t.id);
}

function oracleIds(s: TxScenario): number[] {
  return oracleFilterSort(ROWS, s.filters, s.sortPref, s.colFilters).map((t) => t.id);
}

describe("tx-client-oracle: fixture", () => {
  it("is deterministic and has the required coverage", () => {
    expect(buildTxPagingFixture()).toEqual(ROWS);
    expect(ROWS).toHaveLength(FIXTURE_SIZE);
    expect(new Set(ROWS.map((r) => r.id)).size).toBe(FIXTURE_SIZE);
    expect(ROWS.some((r) => r.quantity === null)).toBe(true);
    expect(ROWS.some((r) => r.quantity !== null)).toBe(true);
    expect(ROWS.some((r) => r.amount === 0)).toBe(true);
    expect(new Set(ROWS.map((r) => r.accountId)).size).toBe(3);
    expect(new Set(ROWS.map((r) => r.accountType)).size).toBe(2);
    expect(new Set(ROWS.map((r) => r.categoryId)).size).toBe(4);
    expect(ROWS.some((r) => r.portfolioHolding === null)).toBe(true);
    expect(ROWS.some((r) => r.portfolioHolding !== null)).toBe(true);
    expect(ROWS.some((r) => r.tags.includes(","))).toBe(true);
    const dateCounts = new Map<string, number>();
    for (const r of ROWS) dateCounts.set(r.date, (dateCounts.get(r.date) ?? 0) + 1);
    expect(Math.max(...dateCounts.values())).toBeGreaterThanOrEqual(5);
    expect(new Set(ROWS.map((r) => r.source)).size).toBe(10);
  });
});

describe("tx-client-oracle: golden facts (independent of the hook)", () => {
  it("client rule: null quantity sorts smallest (first ascending, last descending)", () => {
    const asc = oracleFilterSort(ROWS, {}, { columnId: "quantity", direction: "asc" });
    const firstNonNull = asc.findIndex((r) => r.quantity !== null);
    expect(firstNonNull).toBeGreaterThan(0);
    expect(asc.slice(0, firstNonNull).every((r) => r.quantity === null)).toBe(true);
    expect(asc.slice(firstNonNull).every((r) => r.quantity !== null)).toBe(true);

    const desc = oracleFilterSort(ROWS, {}, { columnId: "quantity", direction: "desc" });
    const lastNonNull = desc.length - 1 - [...desc].reverse().findIndex((r) => r.quantity !== null);
    expect(desc.slice(lastNonNull + 1).every((r) => r.quantity === null)).toBe(true);
  });

  it("client rule: equal sort keys tie-break by id DESC", () => {
    const out = oracleFilterSort(ROWS, {}, undefined);
    for (let i = 1; i < out.length; i++) {
      if (out[i - 1].date === out[i].date) {
        expect(out[i - 1].id).toBeGreaterThan(out[i].id);
      }
    }
  });
});

describe("tx-client-oracle: parity with the real hook", () => {
  it("runs at least 10 scenarios", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  describe.each(SCENARIOS.map((s) => [s.id, s] as const))("scenario %s", (_id, s) => {
    it("oracle order equals hook order", async () => {
      const hook = await hookIds(s.filters, s.sortPref, s.colFilters);
      expect(oracleIds(s)).toEqual(hook);
    }, 60000);
  });
});

describe("tx-client-oracle: divergence list", () => {
  it("every divergence names a real scenario and has a reason", () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    for (const d of EXPECTED_DIVERGENCES) {
      expect(d.reason.trim().length).toBeGreaterThan(20);
      for (const sid of d.scenarios) expect(ids.has(sid)).toBe(true);
    }
  });

  it("covers every 2.5 item that differs (b, c, e, f, g, h, i, k)", () => {
    const items = new Set(EXPECTED_DIVERGENCES.map((d) => d.item));
    for (const it of ["2.5 b", "2.5 c", "2.5 e", "2.5 f", "2.5 g", "2.5 h", "2.5 i", "2.5 k"]) {
      expect(items.has(it)).toBe(true);
    }
  });
});
