/**
 * PGlite implementation of LocalStore (local-first prototype P1, PKG-07).
 * Device-only. Synthetic data. Never imports server DB or query modules.
 *
 * Backends:
 *  - "memory":  dataDir "memory://". A new instance starts EMPTY. Closing it discards the data,
 *               so reopen() on memory cannot persist. Tests use it for the query contract only.
 *  - "idb":     dataDir "idb://finlynq-lf-proto-v0-<name>" (browser IndexedDB, survives reload).
 *  - "node-fs": test-only. A real directory (absolute path) so close + reopen can be tested.
 */
import { PGlite } from "@electric-sql/pglite";
import type { StoreBackend, LocalStore, TableName, LocalRow, BalanceOptions, BalanceRow, CategoryTotalRow, MonthTypeRow, MonthCurrencyRow, RowCounts, EngineId } from "./types";
import { LOCAL_DDL, LOCAL_SCHEMA_VERSION, TABLE_COLUMNS } from "./schema";
import { accountBalancesSql, SPENDING_BY_CATEGORY_SQL, INCOME_VS_EXPENSES_SQL, NET_WORTH_BY_MONTH_SQL } from "./local-queries";

const IDB_PREFIX = "finlynq-lf-proto-v0-";
const CHUNK = 500;
const BOOL_COLUMNS = new Set(["archived", "isInvestment", "invisible"]);

export interface PgliteStoreOptions {
  backend: Extract<StoreBackend, "memory" | "idb" | "node-fs">;
  /** Required for "idb": lowercase letters, digits and dashes. */
  name?: string;
  /** Required for "node-fs": absolute directory path. */
  dataDir?: string;
}

export function dataDirFor(opts: PgliteStoreOptions): string {
  if (opts.backend === "memory") return "memory://";
  if (opts.backend === "idb") {
    if (!opts.name || !/^[a-z0-9-]+$/.test(opts.name)) throw new Error("idb backend needs name matching [a-z0-9-]+");
    return `idb://${IDB_PREFIX}${opts.name}`;
  }
  if (!opts.dataDir) throw new Error("node-fs backend needs dataDir");
  return opts.dataDir;
}

function cell(row: LocalRow, prop: string): unknown {
  const v = (row as unknown as Record<string, unknown>)[prop];
  if (v === undefined || v === null) return BOOL_COLUMNS.has(prop) ? false : null;
  return v;
}

export class PgliteStore implements LocalStore {
  readonly engine: EngineId = "pglite";
  readonly backend: StoreBackend;
  private readonly dataDir: string;
  private db: PGlite | null = null;

  constructor(opts: PgliteStoreOptions) {
    this.backend = opts.backend;
    this.dataDir = dataDirFor(opts);
  }

  private conn(): PGlite {
    if (!this.db) throw new Error("local store is not open");
    return this.db;
  }

  async open(): Promise<void> {
    if (this.db) return;
    const db = new PGlite(this.dataDir);
    try {
      await db.waitReady;
      await db.transaction(async (tx) => {
        for (const stmt of LOCAL_DDL) await tx.exec(stmt);
        await tx.query(
          "INSERT INTO local_meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO NOTHING",
          [LOCAL_SCHEMA_VERSION],
        );
      });
      const r = await db.query<{ value: number }>("SELECT value FROM local_meta WHERE key = 'schema_version'");
      const found = r.rows[0]?.value;
      if (found !== LOCAL_SCHEMA_VERSION) throw new Error(`unsupported local schema_version ${String(found)}`);
      this.db = db;
    } catch (err) {
      await db.close().catch(() => undefined);
      throw err;
    }
  }

  async close(): Promise<void> {
    if (!this.db) return;
    const db = this.db;
    this.db = null;
    await db.close();
  }

  async schemaVersion(): Promise<number> {
    const r = await this.conn().query<{ value: number }>("SELECT value FROM local_meta WHERE key = 'schema_version'");
    return Number(r.rows[0]?.value);
  }

  async upsertRows(table: TableName, rows: LocalRow[]): Promise<void> {
    if (rows.length === 0) return;
    const cols = TABLE_COLUMNS[table];
    if (!cols) throw new Error(`unknown table ${String(table)}`);
    const colList = cols.map(([, c]) => c).join(", ");
    const updates = cols
      .filter(([, c]) => c !== "id")
      .map(([, c]) => `${c} = EXCLUDED.${c}`)
      .join(", ");
    // Duplicate ids in one call: last one wins (a multi-row ON CONFLICT cannot touch one row twice).
    const byId = new Map<string, LocalRow>();
    for (const row of rows) byId.set(row.id, row);
    const uniq = Array.from(byId.values());
    const db = this.conn();
    await db.transaction(async (tx) => {
      for (let start = 0; start < uniq.length; start += CHUNK) {
        const chunk = uniq.slice(start, start + CHUNK);
        const params: unknown[] = [];
        const tuples: string[] = [];
        for (const row of chunk) {
          const ph: string[] = [];
          for (const [prop] of cols) {
            const v = cell(row, prop);
            if (prop === "amount" && typeof v !== "number") throw new RangeError("amount must be a number");
            if (prop === "amount" && !Number.isFinite(v as number)) throw new RangeError("amount must be finite");
            params.push(v);
            ph.push(`$${params.length}`);
          }
          tuples.push(`(${ph.join(", ")})`);
        }
        await tx.query(
          `INSERT INTO ${table} (${colList}) VALUES ${tuples.join(", ")} ON CONFLICT (id) DO UPDATE SET ${updates}`,
          params,
        );
      }
    });
  }

  async deleteRows(table: TableName, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    if (!TABLE_COLUMNS[table]) throw new Error(`unknown table ${String(table)}`);
    const db = this.conn();
    await db.transaction(async (tx) => {
      for (let start = 0; start < ids.length; start += CHUNK) {
        const chunk = ids.slice(start, start + CHUNK);
        const ph = chunk.map((_, i) => `$${i + 1}`).join(", ");
        await tx.query(`DELETE FROM ${table} WHERE id IN (${ph})`, chunk);
      }
    });
  }

  async counts(): Promise<RowCounts> {
    const db = this.conn();
    const a = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM accounts");
    const c = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM categories");
    const t = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM transactions");
    return { accounts: Number(a.rows[0].n), categories: Number(c.rows[0].n), transactions: Number(t.rows[0].n) };
  }

  async accountBalances(opts: BalanceOptions): Promise<BalanceRow[]> {
    const r = await this.conn().query<{
      accountId: string;
      accountType: string | null;
      accountGroup: string | null;
      currency: string | null;
      archived: boolean;
      isInvestment: boolean;
      invisible: boolean;
      balance: number;
    }>(accountBalancesSql(opts.includeArchived, opts.includeInvisible));
    return r.rows.map((x) => ({ ...x, balance: Number(x.balance) }));
  }

  async spendingByCategory(start: string, end: string): Promise<CategoryTotalRow[]> {
    const r = await this.conn().query<CategoryTotalRow>(SPENDING_BY_CATEGORY_SQL, [start, end]);
    return r.rows.map((x) => ({ ...x, total: Number(x.total) }));
  }

  async incomeVsExpenses(start: string, end: string): Promise<MonthTypeRow[]> {
    const r = await this.conn().query<MonthTypeRow>(INCOME_VS_EXPENSES_SQL, [start, end]);
    return r.rows.map((x) => ({ ...x, total: Number(x.total) }));
  }

  async netWorthByMonth(): Promise<MonthCurrencyRow[]> {
    const r = await this.conn().query<{ month: string; currency: string | null; cumulative: number }>(NET_WORTH_BY_MONTH_SQL);
    return r.rows.map((x) => ({ month: x.month, currency: x.currency, cumulative: Number(x.cumulative) }));
  }

  async wipe(): Promise<void> {
    const db = this.conn();
    await db.transaction(async (tx) => {
      await tx.exec("DELETE FROM transactions; DELETE FROM categories; DELETE FROM accounts;");
    });
  }
}
