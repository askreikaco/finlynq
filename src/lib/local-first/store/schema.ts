/**
 * Lean local DDL (local-first prototype P1). Column names mirror the server
 * (src/db/schema-pg.ts) where a query needs them; investment, import and audit
 * columns are dropped (non-goals). Money is DOUBLE PRECISION, as on the server.
 */

export const LOCAL_SCHEMA_VERSION = 1;

export const LOCAL_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS local_meta (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    server_id INTEGER,
    type TEXT,
    "group" TEXT,
    currency TEXT,
    name TEXT,
    archived BOOLEAN NOT NULL DEFAULT false,
    is_investment BOOLEAN NOT NULL DEFAULT false,
    invisible BOOLEAN NOT NULL DEFAULT false,
    row_hlc TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    server_id INTEGER,
    type TEXT,
    "group" TEXT,
    name TEXT,
    row_hlc TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    server_id INTEGER,
    date TEXT NOT NULL,
    account_id TEXT,
    category_id TEXT,
    currency TEXT,
    amount DOUBLE PRECISION NOT NULL,
    entered_currency TEXT,
    entered_amount DOUBLE PRECISION,
    entered_fx_rate DOUBLE PRECISION,
    payee TEXT,
    note TEXT,
    tags TEXT,
    link_id TEXT,
    row_hlc TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date)`,
  `CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions (account_id)`,
  `CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category_id)`,
];

/** Column map per table: row property -> SQL column. Order fixes the INSERT column list. */
export const TABLE_COLUMNS: Record<"accounts" | "categories" | "transactions", Array<[string, string]>> = {
  accounts: [
    ["id", "id"],
    ["serverId", "server_id"],
    ["type", "type"],
    ["group", '"group"'],
    ["currency", "currency"],
    ["name", "name"],
    ["archived", "archived"],
    ["isInvestment", "is_investment"],
    ["invisible", "invisible"],
    ["rowHlc", "row_hlc"],
  ],
  categories: [
    ["id", "id"],
    ["serverId", "server_id"],
    ["type", "type"],
    ["group", '"group"'],
    ["name", "name"],
    ["rowHlc", "row_hlc"],
  ],
  transactions: [
    ["id", "id"],
    ["serverId", "server_id"],
    ["date", "date"],
    ["accountId", "account_id"],
    ["categoryId", "category_id"],
    ["currency", "currency"],
    ["amount", "amount"],
    ["enteredCurrency", "entered_currency"],
    ["enteredAmount", "entered_amount"],
    ["enteredFxRate", "entered_fx_rate"],
    ["payee", "payee"],
    ["note", "note"],
    ["tags", "tags"],
    ["linkId", "link_id"],
    ["rowHlc", "row_hlc"],
  ],
};
