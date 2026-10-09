/**
 * LocalStore interface (local-first prototype P1, PKG-07). Device-only, synthetic data.
 * No server imports: this module must not depend on '@/db' or '@/lib/queries'.
 */

export type EngineId = "pglite"; // DEFAULT-PENDING-OWNER: future "sqlite-wasm"

/**
 * "node-fs" is test-only: PGlite on a real directory so reopen can be tested.
 * "opfs-ahp" is declared for the plan's comparison runs; not implemented in this package.
 */
export type StoreBackend = "memory" | "idb" | "opfs-ahp" | "node-fs";

export type TableName = "accounts" | "categories" | "transactions";

export interface AccountRow {
  id: string;
  serverId?: number | null;
  type: string | null;
  group: string | null;
  currency: string | null;
  name: string | null;
  archived: boolean;
  isInvestment: boolean;
  invisible: boolean;
  rowHlc?: string | null;
}

export interface CategoryRow {
  id: string;
  serverId?: number | null;
  type: string | null;
  group: string | null;
  name: string | null;
  rowHlc?: string | null;
}

export interface TransactionRow {
  id: string;
  serverId?: number | null;
  date: string; // YYYY-MM-DD, same text form as the server column
  accountId: string | null;
  categoryId: string | null;
  currency: string | null;
  amount: number; // DOUBLE PRECISION, as on the server
  enteredCurrency?: string | null;
  enteredAmount?: number | null;
  enteredFxRate?: number | null;
  payee?: string | null;
  note?: string | null;
  tags?: string | null;
  linkId?: string | null;
  rowHlc?: string | null;
}

export type LocalRow = AccountRow | CategoryRow | TransactionRow;

export interface BalanceOptions {
  includeArchived: boolean;
  includeInvisible: boolean;
}

export interface BalanceRow {
  accountId: string;
  accountType: string | null;
  accountGroup: string | null;
  currency: string | null;
  archived: boolean;
  isInvestment: boolean;
  invisible: boolean;
  balance: number;
}

export interface CategoryTotalRow {
  categoryId: string | null;
  categoryGroup: string | null;
  categoryType: string | null;
  total: number;
}

export interface MonthTypeRow {
  month: string; // YYYY-MM
  type: string | null;
  currency: string | null;
  total: number;
}

export interface MonthCurrencyRow {
  month: string; // YYYY-MM
  currency: string | null; // null = account-less rows
  cumulative: number;
}

export interface RowCounts {
  accounts: number;
  categories: number;
  transactions: number;
}

export interface LocalStore {
  readonly engine: EngineId;
  readonly backend: StoreBackend;
  open(): Promise<void>;
  close(): Promise<void>;
  schemaVersion(): Promise<number>;
  /** Batched upsert by id (chunks of 500 rows, all inside one transaction). */
  upsertRows(table: TableName, rows: LocalRow[]): Promise<void>;
  deleteRows(table: TableName, ids: string[]): Promise<void>;
  counts(): Promise<RowCounts>;
  accountBalances(opts: BalanceOptions): Promise<BalanceRow[]>;
  /** Category type 'E' only; start and end are inclusive YYYY-MM-DD. */
  spendingByCategory(start: string, end: string): Promise<CategoryTotalRow[]>;
  /** Category type 'E' or 'I' only; start and end are inclusive. */
  incomeVsExpenses(start: string, end: string): Promise<MonthTypeRow[]>;
  netWorthByMonth(): Promise<MonthCurrencyRow[]>;
  /** Deletes every row in the three data tables. Keeps local_meta. */
  wipe(): Promise<void>;
}
