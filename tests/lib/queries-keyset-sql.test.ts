/**
 * Renders the P2 keyset / ORDER BY / filter SQL with PgDialect and asserts
 * the text and bound params. No database: queries.ts is imported for its
 * pure builders only.
 */
import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";

const fake = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  limit: 0,
  offset: 0,
}));

vi.mock("@/db", async () => {
  const schemaPg = await vi.importActual<typeof import("@/db/schema-pg")>("@/db/schema-pg");
  // Stub chain: records limit/offset and returns the slice. Ordering and
  // predicates are not evaluated here; this only checks paging plumbing.
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "all") return () => fake.rows.slice(fake.offset, fake.offset + fake.limit);
        if (prop === "limit") return (n: number) => { fake.limit = n; return chain; };
        if (prop === "offset") return (n: number) => { fake.offset = n; return chain; };
        if (prop === "then") return undefined;
        return () => chain;
      },
    },
  );
  return { db: { select: () => chain }, schema: schemaPg, getDialect: () => "postgres" };
});

import {
  buildTxKeysetCondition,
  buildTxOrderBy,
  buildTxFilterConditions,
  getTransactionsPage,
} from "@/lib/queries";
import { decodeCursor, type TxKeysetCursor } from "@/lib/transactions/cursor";

const dialect = new PgDialect();
const render = (expr: SQL) => dialect.sqlToQuery(expr);
const renderOrder = (clauses: SQL[]) => render(sql.join(clauses, sql`, `));

describe("keyset predicate SQL", () => {
  const dateCur: TxKeysetCursor = { v: 1, s: "date", d: "desc", k: "2026-03-01", id: 42 };
  const amtCur: TxKeysetCursor = { v: 1, s: "amount", d: "asc", k: -12.5, id: 42 };

  it("date DESC: col <= k AND (col < k OR (col = k AND id < lastId))", () => {
    const q = render(buildTxKeysetCondition("date", "desc", dateCur));
    expect(q.sql).toBe(
      '("transactions"."date" <= $1 AND ("transactions"."date" < $2 OR ("transactions"."date" = $3 AND "transactions"."id" < $4)))',
    );
    expect(q.params).toEqual(["2026-03-01", "2026-03-01", "2026-03-01", 42]);
  });

  it("date ASC (id still DESC): col >= k AND (col > k OR (col = k AND id < lastId))", () => {
    const q = render(buildTxKeysetCondition("date", "asc", { ...dateCur, d: "asc" }));
    expect(q.sql).toBe(
      '("transactions"."date" >= $1 AND ("transactions"."date" > $2 OR ("transactions"."date" = $3 AND "transactions"."id" < $4)))',
    );
    expect(q.params).toEqual(["2026-03-01", "2026-03-01", "2026-03-01", 42]);
  });

  it("amount DESC binds the numeric keyset value", () => {
    const q = render(buildTxKeysetCondition("amount", "desc", { ...amtCur, d: "desc", k: 99.99 }));
    expect(q.sql).toBe(
      '("transactions"."amount" <= $1 AND ("transactions"."amount" < $2 OR ("transactions"."amount" = $3 AND "transactions"."id" < $4)))',
    );
    expect(q.params).toEqual([99.99, 99.99, 99.99, 42]);
  });

  it("amount ASC uses >= / > and keeps id < lastId", () => {
    const q = render(buildTxKeysetCondition("amount", "asc", amtCur));
    expect(q.sql).toBe(
      '("transactions"."amount" >= $1 AND ("transactions"."amount" > $2 OR ("transactions"."amount" = $3 AND "transactions"."id" < $4)))',
    );
    expect(q.params).toEqual([-12.5, -12.5, -12.5, 42]);
  });

  it("never emits a row comparison", () => {
    for (const [sort, dir, cur] of [
      ["date", "desc", dateCur],
      ["date", "asc", { ...dateCur, d: "asc" }],
      ["amount", "desc", { ...amtCur, d: "desc" }],
      ["amount", "asc", amtCur],
    ] as const) {
      expect(render(buildTxKeysetCondition(sort, dir, cur as TxKeysetCursor)).sql).not.toMatch(/\(\s*"transactions"\."(date|amount)"\s*,/);
    }
  });

  it("rejects a cursor whose sort or direction does not match", () => {
    expect(() => buildTxKeysetCondition("date", "asc", dateCur)).toThrow(/does not match/);
  });
});

describe("ORDER BY SQL", () => {
  it("date/amount keep id DESC as the tiebreak", () => {
    expect(renderOrder(buildTxOrderBy("date", "desc")).sql).toBe(
      '"transactions"."date" desc, "transactions"."id" desc',
    );
    expect(renderOrder(buildTxOrderBy("amount", "asc")).sql).toBe(
      '"transactions"."amount" asc, "transactions"."id" desc',
    );
  });

  it("default (undefined sort) is date DESC", () => {
    expect(renderOrder(buildTxOrderBy(undefined, "desc")).sql).toBe(
      '"transactions"."date" desc, "transactions"."id" desc',
    );
  });

  it("quantity: ASC NULLS FIRST, DESC NULLS LAST (client null-smallest, owner D9)", () => {
    expect(renderOrder(buildTxOrderBy("quantity", "asc")).sql).toBe(
      '"transactions"."quantity" ASC NULLS FIRST, "transactions"."id" desc',
    );
    expect(renderOrder(buildTxOrderBy("quantity", "desc")).sql).toBe(
      '"transactions"."quantity" DESC NULLS LAST, "transactions"."id" desc',
    );
  });

  it("accountType: COLLATE \"C\" plus NULLS rule", () => {
    expect(renderOrder(buildTxOrderBy("accountType", "asc")).sql).toBe(
      '"accounts"."type" COLLATE "C" ASC NULLS FIRST, "transactions"."id" desc',
    );
    expect(renderOrder(buildTxOrderBy("accountType", "desc")).sql).toBe(
      '"accounts"."type" COLLATE "C" DESC NULLS LAST, "transactions"."id" desc',
    );
  });

  it("source: COLLATE \"C\" and no NULLS clause (column is NOT NULL)", () => {
    expect(renderOrder(buildTxOrderBy("source", "asc")).sql).toBe(
      '"transactions"."source" COLLATE "C" ASC, "transactions"."id" desc',
    );
    expect(renderOrder(buildTxOrderBy("source", "desc")).sql).toBe(
      '"transactions"."source" COLLATE "C" DESC, "transactions"."id" desc',
    );
  });

  it("createdAt / updatedAt use plain asc/desc", () => {
    expect(renderOrder(buildTxOrderBy("createdAt", "asc")).sql).toBe(
      '"transactions"."created_at" asc, "transactions"."id" desc',
    );
    expect(renderOrder(buildTxOrderBy("updatedAt", "desc")).sql).toBe(
      '"transactions"."updated_at" desc, "transactions"."id" desc',
    );
  });
});

describe("filter SQL: ids and kindLike", () => {
  it("ids binds ONE array param via ANY, never one param per id", () => {
    const conds = buildTxFilterConditions("u1", { ids: [5, 6, 7] });
    const q = render(sql.join(conds, sql` AND `));
    expect(q.sql).toContain('"transactions"."id" = ANY($2::int[])');
    expect(q.sql).not.toMatch(/\$3/);
    expect(q.params).toEqual(["u1", [5, 6, 7]]);
  });

  it("empty ids matches nothing via 1 = 0 and binds no id param", () => {
    const conds = buildTxFilterConditions("u1", { ids: [] });
    const q = render(sql.join(conds, sql` AND `));
    expect(q.sql).toContain("1 = 0");
    expect(q.sql).not.toContain("ANY");
    expect(q.params).toEqual(["u1"]);
  });

  it("kindLike uses ILIKE with the pattern as a param", () => {
    const conds = buildTxFilterConditions("u1", { kindLike: "%buy%" });
    const q = render(sql.join(conds, sql` AND `));
    expect(q.sql).toContain('"transactions"."kind" ILIKE $2');
    expect(q.params).toEqual(["u1", "%buy%"]);
  });

  it("no ids or kindLike adds no condition", () => {
    const conds = buildTxFilterConditions("u1", {});
    expect(conds).toHaveLength(1);
  });
});

describe("getTransactionsPage plumbing (stub db)", () => {
  const sevenRows = Array.from({ length: 7 }, (_, i) => ({
    id: 100 - i,
    date: `2026-03-0${Math.min(7, 7 - i)}`,
    amount: 10 + i,
    quantity: null,
  }));

  it("fetches limit+1, reports hasMore, and returns the first page", async () => {
    fake.rows = sevenRows;
    const page = await getTransactionsPage("u1", { sortColumnId: "date", sortDirection: "desc" }, 3);
    expect(fake.limit).toBe(4);
    expect(fake.offset).toBe(0);
    expect(page.rows.map((r) => r.id)).toEqual([100, 99, 98]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
  });

  it("date keyset cursor carries the last returned row's date and id", async () => {
    fake.rows = sevenRows;
    const page = await getTransactionsPage("u1", { sortColumnId: "date", sortDirection: "desc" }, 3);
    const c = decodeCursor(page.nextCursor!, { sort: "date", direction: "desc" });
    expect(c).toEqual({ v: 1, s: "date", d: "desc", k: "2026-03-05", id: 98 });
  });

  it("amount keyset cursor carries the amount value", async () => {
    fake.rows = sevenRows;
    const page = await getTransactionsPage("u1", { sortColumnId: "amount", sortDirection: "asc" }, 2);
    const c = decodeCursor(page.nextCursor!, { sort: "amount", direction: "asc" });
    expect(c).toEqual({ v: 1, s: "amount", d: "asc", k: 11, id: 99 });
  });

  it("offset sort carries offset + page length, not a keyset value", async () => {
    fake.rows = sevenRows;
    const page = await getTransactionsPage("u1", { sortColumnId: "quantity", sortDirection: "asc" }, 3);
    const c = decodeCursor(page.nextCursor!, { sort: "quantity", direction: "asc" });
    expect(c).toEqual({ v: 1, s: "quantity", d: "asc", o: 3 });
  });

  it("last page: hasMore false and nextCursor null", async () => {
    fake.rows = sevenRows.slice(0, 3);
    const page = await getTransactionsPage("u1", { sortColumnId: "date", sortDirection: "desc" }, 3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.rows).toHaveLength(3);
  });

  it("rejects a cursor minted for another sort", async () => {
    const other = { v: 1 as const, s: "amount" as const, d: "desc" as const, k: 1, id: 1 };
    await expect(
      getTransactionsPage("u1", { sortColumnId: "date", sortDirection: "desc", cursor: other }, 3),
    ).rejects.toThrow(/does not match/);
  });

  it("rejects a non-positive limit", async () => {
    await expect(getTransactionsPage("u1", undefined, 0)).rejects.toThrow(RangeError);
  });
});
