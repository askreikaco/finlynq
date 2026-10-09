/**
 * Server oracle for the local-first parity harness (PKG-09). TEST HELPER, synthetic data only.
 *
 * A PGlite `memory://` database behind the REAL server query functions (src/lib/queries.ts):
 * schema = drizzle-kit generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema-pg)),
 * applied statement by statement (any failure throws; no hand-written fallback DDL here),
 * then plugged in with setAdapter (pattern: tests/helpers/portfolio-fixtures.ts:66-72).
 * This is an emulation of Postgres, not Postgres itself.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schemaPg from "@/db/schema-pg";
import { setAdapter, setDialect } from "@/db";
import type { DatabaseAdapter, DrizzleDb } from "@/db/adapter";
import type { FixtureDataset } from "@/lib/local-first/fixture/generate";

/** Fixed user id for every oracle row (the fixture has no user column). */
export const ORACLE_USER_ID = "oracle-user";

export interface ServerOracle {
  client: PGlite;
  /** Fixture account id (ULID) -> server integer id. */
  accountServerId: Map<string, number>;
  /** Fixture category id (ULID) -> server integer id. */
  categoryServerId: Map<string, number>;
  statementCount: number;
  close(): Promise<void>;
}

const CHUNK = 500;

export async function createServerOracle(data: FixtureDataset): Promise<ServerOracle> {
  const client = new PGlite("memory://");
  const orm = drizzle(client, { schema: schemaPg });

  // Schema: generated DDL only. A failing statement is a STOP condition, reported by the throw.
  const statements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schemaPg as unknown as Record<string, unknown>),
  );
  for (let i = 0; i < statements.length; i++) {
    try {
      await client.exec(statements[i]);
    } catch (e) {
      await client.close();
      throw new Error(`oracle DDL statement ${i} failed: ${(e as Error).message}`);
    }
  }

  const adapter: DatabaseAdapter = {
    dialect: "postgres",
    initialize: () => {},
    getDb: () => orm as unknown as DrizzleDb,
    isConnected: () => true,
    isReadOnly: () => false,
    migrate: () => {},
    close: () => {},
  };
  setAdapter(adapter);
  setDialect("postgres");

  const accountServerId = new Map(data.accounts.map((a) => [a.id, a.serverId] as const));
  const categoryServerId = new Map(data.categories.map((c) => [c.id, c.serverId] as const));
  const accountById = new Map(data.accounts.map((a) => [a.id, a] as const));

  const accountRows = data.accounts.map((a) => ({
    id: a.serverId,
    userId: ORACLE_USER_ID,
    type: a.type,
    group: a.group,
    currency: a.currency,
    archived: a.archived,
    isInvestment: a.isInvestment,
    invisible: a.invisible,
  }));
  const categoryRows = data.categories.map((c) => ({
    id: c.serverId,
    userId: ORACLE_USER_ID,
    type: c.type,
    group: c.group,
  }));
  const txRows = data.transactions.map((t) => {
    if (!accountById.has(t.accountId)) throw new Error(`tx ${t.id} has unknown account`);
    return {
      id: t.serverId,
      userId: ORACLE_USER_ID,
      date: t.date,
      accountId: accountServerId.get(t.accountId) ?? null,
      categoryId: t.categoryId === null ? null : (categoryServerId.get(t.categoryId) ?? null),
      currency: t.currency,
      amount: t.amount,
      enteredCurrency: t.enteredCurrency,
      enteredAmount: t.enteredAmount,
      enteredFxRate: t.enteredFxRate,
      payee: t.payee,
      note: t.note,
      tags: t.tags,
      linkId: t.linkId,
    };
  });

  for (let s = 0; s < accountRows.length; s += CHUNK) await orm.insert(schemaPg.accounts).values(accountRows.slice(s, s + CHUNK));
  for (let s = 0; s < categoryRows.length; s += CHUNK) await orm.insert(schemaPg.categories).values(categoryRows.slice(s, s + CHUNK));
  for (let s = 0; s < txRows.length; s += CHUNK) await orm.insert(schemaPg.transactions).values(txRows.slice(s, s + CHUNK));

  return {
    client,
    accountServerId,
    categoryServerId,
    statementCount: statements.length,
    close: async () => {
      await client.close();
    },
  };
}
