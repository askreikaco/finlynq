/**
 * Investment split predicate (scope=investment|daily) rendered with PgDialect. No database.
 * Investment = holding-linked OR account.is_investment OR account.group trimmed/case-insensitive 'Investment'.
 */
import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";

vi.mock("@/db", async () => {
  const schemaPg = await vi.importActual<typeof import("@/db/schema-pg")>("@/db/schema-pg");
  const chain: Record<string, unknown> = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : () => chain) });
  return { db: { select: () => chain }, schema: schemaPg, getDialect: () => "postgres" };
});

import { investmentTxPredicate, buildTxFilterConditions } from "@/lib/queries";

const dialect = new PgDialect();
const render = (e: SQL) => dialect.sqlToQuery(e);
const norm = (s: string) => s.replace(/\s+/g, " ");

describe("investmentTxPredicate", () => {
  const q = render(investmentTxPredicate());
  const text = norm(q.sql);

  it("matches holding-linked rows", () => {
    expect(text).toContain('"transactions"."portfolio_holding_id" IS NOT NULL');
  });
  it("matches flagged accounts", () => {
    expect(text).toContain('"accounts"."is_investment" = true');
  });
  it("matches the Investment account group, trimmed and case-insensitive (covers 'investment', ' Investment ')", () => {
    expect(text).toContain(`lower(btrim("accounts"."group")) = 'investment'`);
  });
  it("is one EXISTS over the row's own account, OR-ed (a normal cash account matches none)", () => {
    expect(text).toContain('"accounts"."id" = "transactions"."account_id"');
    expect(text).toMatch(/is_investment" = true OR lower\(btrim/);
    expect(q.params).toEqual([]);
  });
});

describe("scope conditions", () => {
  const rendered = (scope?: "daily" | "investment" | "all") =>
    buildTxFilterConditions("u1", { scope }).map((c) => norm(render(c as SQL).sql));

  it("investment adds the predicate", () => {
    expect(rendered("investment").some((s) => s.includes("btrim"))).toBe(true);
  });
  it("daily adds NOT predicate (per-row: personal leg of a transfer stays, investment leg is excluded, both-investment transfer never shows)", () => {
    const c = rendered("daily").filter((s) => s.includes("btrim"));
    expect(c).toHaveLength(1);
    expect(c[0].startsWith("NOT (")).toBe(true);
  });
  it("all/undefined adds nothing", () => {
    expect(rendered("all").some((s) => s.includes("btrim"))).toBe(false);
    expect(rendered(undefined).some((s) => s.includes("btrim"))).toBe(false);
  });
});
