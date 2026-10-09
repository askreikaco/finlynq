/**
 * Scenario matrix for Transactions paging parity (plan section 2.1 x sorts,
 * plus combinations). Each scenario is run through the client oracle
 * (tests/helpers/tx-client-oracle.ts) and, in the self-test, through the real
 * hook. Server parity (P4+) reuses SCENARIOS and skips EXPECTED_DIVERGENCES.
 */
import type {
  UseTransactionsColFilter,
  UseTransactionsFilters,
  UseTransactionsSortPref,
} from "@/app/(app)/transactions/_hooks/use-transactions";

export type TxScenario = {
  id: string;
  /** plan section 2.1 row or "sort" / "combo" */
  group: string;
  filters: UseTransactionsFilters;
  sortPref?: UseTransactionsSortPref;
  colFilters?: UseTransactionsColFilter[];
};

/** Typed loosely: colFilter shapes are a union; the hook accepts all of them. */
const cf = (x: Record<string, unknown>): UseTransactionsColFilter =>
  x as unknown as UseTransactionsColFilter;

const sortCol = (columnId: string, direction: "asc" | "desc"): UseTransactionsSortPref =>
  ({ columnId, direction }) as unknown as UseTransactionsSortPref;
const sortId = (id: string, desc: boolean): UseTransactionsSortPref =>
  ({ id, desc }) as unknown as UseTransactionsSortPref;

const SORT_COLUMNS = [
  "amount",
  "quantity",
  "createdAt",
  "updatedAt",
  "source",
  "accountType",
] as const;

export const SCENARIOS: TxScenario[] = [
  // ── plan 2.1 rows ─────────────────────────────────────────────────────────
  { id: "date-range", group: "2.1 date", filters: { startDate: "2026-01-12", endDate: "2026-02-16" } },
  { id: "date-open-start", group: "2.1 date", filters: { startDate: "2026-02-01" } },
  { id: "created-range", group: "2.1 createdAt", filters: {}, colFilters: [cf({ type: "date", columnId: "createdAt", from: "2026-01-03", to: "2026-01-06" })] },
  { id: "updated-range", group: "2.1 updatedAt", filters: {}, colFilters: [cf({ type: "date", columnId: "updatedAt", from: "2026-02-05", to: "2026-02-15" })] },
  { id: "account-single", group: "2.1 accountId", filters: { accountId: "2" } },
  { id: "account-list", group: "2.1 accountId", filters: { accountId: "1,3" } }, // 2.5 d
  { id: "account-garbage", group: "2.1 accountId", filters: { accountId: "abc,,-4" } },
  { id: "category-list", group: "2.1 categoryId", filters: { categoryId: "10,12" } },
  { id: "amount-eq", group: "2.1 amount", filters: {}, colFilters: [cf({ type: "numeric", columnId: "amount", op: "eq", value: -45 })] },
  { id: "amount-between", group: "2.1 amount", filters: {}, colFilters: [cf({ type: "numeric", columnId: "amount", op: "between", value: -50, value2: 100 })] },
  { id: "amount-min-max", group: "2.1 minAmount/maxAmount", filters: { minAmount: "40", maxAmount: "300" } },
  { id: "amount-gt-zero", group: "2.1 amount gt", filters: {}, colFilters: [cf({ type: "numeric", columnId: "amount", op: "gt", value: 0 })] }, // 2.5 e
  { id: "amount-lt-zero", group: "2.1 amount lt", filters: {}, colFilters: [cf({ type: "numeric", columnId: "amount", op: "lt", value: 0 })] }, // 2.5 e
  { id: "quantity-eq", group: "2.1 quantity", filters: {}, colFilters: [cf({ type: "numeric", columnId: "quantity", op: "eq", value: 1 })] },
  { id: "quantity-between", group: "2.1 quantity", filters: {}, colFilters: [cf({ type: "numeric", columnId: "quantity", op: "between", value: 1, value2: 5 })] },
  { id: "direction-out", group: "2.1 direction", filters: { direction: "out" } },
  { id: "direction-in", group: "2.1 direction", filters: { direction: "in" } }, // 2.5 f
  { id: "source-enum", group: "2.1 sources", filters: {}, colFilters: [cf({ type: "enum", columnId: "source", values: ["import", "manual"] })] },
  { id: "source-enum-all", group: "2.1 sources", filters: {}, colFilters: [cf({ type: "enum", columnId: "source", values: ["manual", "import", "mcp_http", "mcp_stdio", "connector", "sample_data", "backup_restore", "reconcile_link", "backfill_synth", "auto_rule"] })] },
  { id: "id-deeplink", group: "2.1 id", filters: { id: "1010" } },
  { id: "id-invalid", group: "2.1 id", filters: { id: "abc" } }, // 2.5 k
  { id: "holding-exact", group: "2.1 portfolioHolding", filters: { portfolioHolding: "Apple Inc" } },
  { id: "holding-substring", group: "2.1 portfolioHolding", filters: { portfolioHolding: "vgro" } }, // 2.5 c
  { id: "kind-text", group: "2.1 filter_kind", filters: {}, colFilters: [cf({ type: "text", columnId: "kind", value: "buy" })] },
  { id: "ticker-text", group: "2.1 filter_portfolioTicker", filters: {}, colFilters: [cf({ type: "text", columnId: "portfolioTicker", value: "VGRO" })] }, // 2.5 h
  { id: "account-text", group: "2.1 filter_account", filters: {}, colFilters: [cf({ type: "text", columnId: "account", value: "chequ" })] }, // 2.5 h
  { id: "account-name-enum", group: "2.1 filter_accountName", filters: {}, colFilters: [cf({ id: "accountName", value: ["Savings"] })] },
  { id: "search-payee", group: "2.1 search", filters: { search: "metro" } },
  { id: "search-note", group: "2.1 search", filters: { search: "dividend" } },
  { id: "search-amount", group: "2.1 search", filters: { search: "45" } }, // 2.5 a
  { id: "search-trim", group: "2.1 search", filters: { search: "  weekly  " } }, // 2.5 a
  { id: "tag-exact", group: "2.1 tag", filters: { tag: "food" } },
  { id: "tag-list-or", group: "2.1 tag", filters: { tag: "salary, invest" } }, // 2.5 b
  { id: "tag-substring", group: "2.1 tag", filters: { tag: "fee" } }, // 2.5 b
  { id: "payee-text", group: "2.1 filter_payee", filters: {}, colFilters: [cf({ type: "text", columnId: "payee", value: "Metro" })] },
  { id: "note-text", group: "2.1 filter_note", filters: {}, colFilters: [cf({ type: "text", columnId: "note", value: "fee" })] },
  { id: "tags-text", group: "2.1 filter_tags", filters: {}, colFilters: [cf({ type: "text", columnId: "tags", value: "fees" })] },
  { id: "category-enum", group: "2.1 category", filters: {}, colFilters: [cf({ type: "enum", columnId: "category", values: ["10"] })] },
  { id: "account-enum", group: "2.1 account", filters: {}, colFilters: [cf({ type: "enum", columnId: "account", values: ["3"] })] },
  { id: "canonical-enum", group: "2.1 canonical", filters: {}, colFilters: [cf({ type: "enum", columnId: "canonical", values: ["canonical"] })] }, // 2.5 i (OWNER)
  { id: "date-topbar-plus-col", group: "2.5 g", filters: { startDate: "2026-02-01" }, colFilters: [cf({ type: "date", columnId: "date", from: "2026-01-10", to: "2026-02-12" })] }, // 2.5 g

  // ── sorts (on the unfiltered fixture) ─────────────────────────────────────
  { id: "sort-default", group: "sort", filters: {} },
  { id: "sort-date-asc", group: "sort", filters: {}, sortPref: sortCol("date", "asc") },
  { id: "sort-date-desc", group: "sort", filters: {}, sortPref: sortCol("date", "desc") },
  { id: "sort-id-shape-desc", group: "sort", filters: {}, sortPref: sortId("amount", true) },
  ...SORT_COLUMNS.flatMap((col) => [
    { id: `sort-${col}-asc`, group: "sort", filters: {}, sortPref: sortCol(col, "asc") },
    { id: `sort-${col}-desc`, group: "sort", filters: {}, sortPref: sortCol(col, "desc") },
  ]),

  // ── combinations ──────────────────────────────────────────────────────────
  { id: "combo-account-search-amount", group: "combo", filters: { accountId: "1", search: "metro" }, sortPref: sortCol("amount", "asc") },
  { id: "combo-date-tag-quantity", group: "combo", filters: { startDate: "2026-01-05", endDate: "2026-03-09", tag: "food,fees" }, sortPref: sortCol("quantity", "desc") },
  { id: "combo-source-minmax-amount", group: "combo", filters: { minAmount: "10", maxAmount: "2000" }, colFilters: [cf({ type: "enum", columnId: "source", values: ["import", "backfill_synth", "auto_rule"] })], sortPref: sortCol("amount", "desc") },
  { id: "combo-holding-category", group: "combo", filters: { categoryId: "12", portfolioHolding: "VGRO" }, sortPref: sortCol("updatedAt", "asc") },
  { id: "combo-direction-ties-createdAt", group: "combo", filters: { direction: "out" }, sortPref: sortCol("createdAt", "desc") },
  { id: "combo-accountType-null-safe", group: "combo", filters: { categoryId: "10,11" }, sortPref: sortCol("accountType", "asc") },
];

/**
 * 2.5 items whose server behaviour (after P2-P4) is NOT equal to the client
 * oracle. Items a, d, i-kind, j are adopted by the server and therefore not
 * listed (they are asserted equal). Scenario ids must exist in SCENARIOS.
 */
export const EXPECTED_DIVERGENCES: ReadonlyArray<{
  item: string;
  scenarios: readonly string[];
  reason: string;
}> = [
  { item: "2.5 b", scenarios: ["tag-substring"], reason: "server tag match is exact per token; client also substring-matches (rawTags.includes). Whitelisted." },
  { item: "2.5 c", scenarios: ["holding-substring"], reason: "server portfolioHolding is an exact HMAC match on name or symbol; client is substring. Drill links send exact values." },
  { item: "2.5 e", scenarios: ["amount-gt-zero", "amount-lt-zero"], reason: "server numeric gt/lt is inclusive (gte/lte); client is strict. Accepted and whitelisted to keep build-query goldens." },
  { item: "2.5 f", scenarios: ["direction-in"], reason: "zero-amount rows: client includes 0 for in/out; server excludes 0. Server rule kept." },
  { item: "2.5 g", scenarios: ["date-topbar-plus-col"], reason: "client intersects top-bar and date column filter; server lets the top bar win. Rare case, kept." },
  { item: "2.5 h", scenarios: ["account-text", "ticker-text"], reason: "client text filter on account/portfolioTicker reads fields absent on the row, so it excludes every row (client bug). Server matches." },
  { item: "2.5 i", scenarios: ["canonical-enum"], reason: "canonical enum: client excludes every row (field absent); server ignores it. [OWNER] pending: drop or compute in SQL." },
  { item: "2.5 k", scenarios: ["id-invalid"], reason: "invalid ?id=abc: client ignores it and shows all rows; server returns empty. Server rule kept." },
];
