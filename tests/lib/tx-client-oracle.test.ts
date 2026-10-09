/**
 * @vitest-environment jsdom
 */
// Self-test for the client oracle (tests/helpers/tx-client-oracle.ts).
// The oracle is now the reference for the SERVER: route parity is asserted in
// tests/api/transactions-paging.test.ts and keyset order in the paging
// verification. The useTransactions hook no longer filters or sorts on the
// client, so this file no longer runs the hook. It pins the fixture, the
// scenario matrix, golden facts (null ordering, tie order) and the divergence list.
import { describe, it, expect } from "vitest";
import type { Transaction } from "@/app/(app)/transactions/_types";
import { oracleFilterSort } from "../helpers/tx-client-oracle";
import { buildTxPagingFixture, FIXTURE_SIZE } from "../helpers/tx-paging-fixture";
import { SCENARIOS, EXPECTED_DIVERGENCES } from "../helpers/tx-paging-scenarios";

const ROWS: Transaction[] = buildTxPagingFixture();

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

describe("tx-client-oracle: scenario matrix", () => {
  it("runs at least 10 scenarios", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
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
