/**
 * Filter + sort definitions of every list that uses the PageToolbar. One entry per list: the generic filter page
 * (/filter/[list]) renders FILTER_CONFIGS[list]; the list page imports the same SORTS / FILTER_KEYS constants so the
 * two never drift. Keep the arrays module-level (stable references for hooks).
 */
import type { FilterSortConfig } from "./filter-config";
import { fieldKeys } from "./filter-config";
import type { SortOption } from "./sort";

const keysOf = (c: FilterSortConfig) => c.fields.flatMap(fieldKeys);

const ASC_SOON = { asc: "Soonest first", desc: "Latest first" } as const;

// ── transactions (the page keeps its own route: /transactions/search) ─────────────────────────────
// No Name sort: payee and note are encrypted at rest, so the server cannot order by them across pages.
export const TRANSACTION_SORTS: readonly SortOption[] = [
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount" },
];
export const TRANSACTIONS_FILTER: FilterSortConfig = {
  title: "Filter",
  fallbackReturnTo: "/transactions",
  sorts: TRANSACTION_SORTS,
  fields: [
    { kind: "segment", key: "direction", label: "Direction", options: [{ value: "", label: "All" }, { value: "in", label: "Incoming" }, { value: "out", label: "Outgoing" }] },
    { kind: "amount", minKey: "minAmount", maxKey: "maxAmount", label: "Amount" },
    { kind: "select", key: "accountId", label: "Account", allLabel: "All accounts", options: "accounts", hideWhenReturnTo: /^\/accounts\// },
    { kind: "select", key: "categoryId", label: "Category", allLabel: "All categories", options: "categories" },
  ],
};
export const TRANSACTION_FILTER_KEYS = keysOf(TRANSACTIONS_FILTER);

// ── accounts ──────────────────────────────────────────────────────────────────────────────────────
export const ACCOUNT_SORTS: readonly SortOption[] = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount" },
];
const ACCOUNTS_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/accounts",
  sorts: ACCOUNT_SORTS,
  fields: [
    { kind: "segment", key: "type", label: "Type", options: [{ value: "", label: "All" }, { value: "A", label: "Assets" }, { value: "L", label: "Liabilities" }] },
    { kind: "segment", key: "archived", label: "Archived accounts", options: [{ value: "", label: "Hide" }, { value: "1", label: "Show" }] },
  ],
};
export const ACCOUNT_FILTER_KEYS = keysOf(ACCOUNTS_FILTER);

// ── goals ─────────────────────────────────────────────────────────────────────────────────────────
export const GOAL_SORTS: readonly SortOption[] = [
  { key: "date", label: "Deadline", dir: "asc", dirLabels: ASC_SOON },
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount" },
];
const GOALS_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/goals",
  sorts: GOAL_SORTS,
  fields: [
    { kind: "segment", key: "status", label: "Status", options: [{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "completed", label: "Completed" }] },
    {
      kind: "select", key: "type", label: "Type", allLabel: "All types",
      options: [
        { value: "savings", label: "Savings" }, { value: "debt_payoff", label: "Debt Payoff" },
        { value: "investment", label: "Investment" }, { value: "emergency_fund", label: "Emergency Fund" },
      ],
    },
  ],
};
export const GOAL_FILTER_KEYS = keysOf(GOALS_FILTER);

// ── loans ─────────────────────────────────────────────────────────────────────────────────────────
export const LOAN_SORTS: readonly SortOption[] = [
  { key: "date", label: "Payoff date", dir: "asc", dirLabels: ASC_SOON },
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount" },
];
const LOANS_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/loans",
  sorts: LOAN_SORTS,
  fields: [
    { kind: "segment", key: "status", label: "Status", options: [{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "completed", label: "Paid off" }] },
    {
      kind: "select", key: "type", label: "Type", allLabel: "All types",
      options: [
        { value: "mortgage", label: "Mortgage" }, { value: "lease", label: "Lease" }, { value: "loan", label: "Loan" },
        { value: "student_loan", label: "Student Loan" }, { value: "credit_card", label: "Credit Card" },
      ],
    },
  ],
};
export const LOAN_FILTER_KEYS = keysOf(LOANS_FILTER);

// ── subscriptions ─────────────────────────────────────────────────────────────────────────────────
export const SUBSCRIPTION_SORTS: readonly SortOption[] = [
  { key: "date", label: "Next payment", dir: "asc", dirLabels: ASC_SOON },
  { key: "name", label: "Name" },
  { key: "amount", label: "Monthly cost" },
];
const SUBSCRIPTIONS_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/subscriptions",
  sorts: SUBSCRIPTION_SORTS,
  fields: [
    {
      kind: "segment", key: "status", label: "Status",
      options: [{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "cancelled", label: "Cancelled" }, { value: "ended", label: "Ended" }],
    },
  ],
};
export const SUBSCRIPTION_FILTER_KEYS = keysOf(SUBSCRIPTIONS_FILTER);

// ── portfolio holdings ────────────────────────────────────────────────────────────────────────────
export const HOLDING_SORTS: readonly SortOption[] = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Market value" },
  { key: "unrealized", label: "Return", dirLabels: { asc: "Lowest first", desc: "Highest first" }, dir: "desc" },
];
const HOLDINGS_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/portfolio",
  sorts: HOLDING_SORTS,
  fields: [
    {
      kind: "select", key: "assetType", label: "Type", allLabel: "All types",
      options: [
        { value: "etf", label: "ETFs" }, { value: "stock", label: "Stocks" }, { value: "crypto", label: "Crypto" },
        { value: "cash", label: "Cash" }, { value: "metal", label: "Metals" },
      ],
    },
    { kind: "segment", key: "empty", label: "Empty positions", options: [{ value: "", label: "Hide" }, { value: "1", label: "Show" }] },
    { kind: "segment", key: "native", label: "Currency", options: [{ value: "", label: "Display" }, { value: "1", label: "Holding" }] },
  ],
};
export const HOLDING_FILTER_KEYS = keysOf(HOLDINGS_FILTER);

// ── categories ────────────────────────────────────────────────────────────────────────────────────
export const CATEGORY_SORTS: readonly SortOption[] = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount" },
];
const CATEGORIES_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/categories",
  sorts: CATEGORY_SORTS,
  fields: [
    {
      kind: "segment", key: "budget", label: "Budget",
      options: [{ value: "", label: "All" }, { value: "with", label: "With budget" }, { value: "none", label: "No budget" }, { value: "over", label: "Over budget" }],
    },
  ],
};
export const CATEGORY_FILTER_KEYS = keysOf(CATEGORIES_FILTER);

// ── reports ───────────────────────────────────────────────────────────────────────────────────────
const REPORTS_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/reports",
  fields: [
    {
      kind: "segment", key: "period", label: "Period",
      options: [{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }],
    },
    { kind: "segment", key: "groupBy", label: "Group by", options: [{ value: "", label: "Category" }, { value: "group", label: "Group" }] },
    { kind: "accounts", key: "accountIds", label: "Accounts" },
    { kind: "segment", key: "business", label: "Transactions", options: [{ value: "", label: "All" }, { value: "1", label: "Business only" }] },
  ],
};
export const REPORT_FILTER_KEYS = keysOf(REPORTS_FILTER);

// ── dividends ─────────────────────────────────────────────────────────────────────────────────────
const TAX_YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => {
  const y = String(new Date().getFullYear() - i);
  return { value: y, label: y };
});
const DIVIDENDS_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/portfolio/dividends",
  fields: [
    { kind: "segment", key: "groupBy", label: "Group by", options: [{ value: "", label: "Year" }, { value: "quarter", label: "Quarter" }, { value: "holding", label: "Holding" }] },
    { kind: "segment", key: "reporting", label: "Show in", options: [{ value: "", label: "Native currency" }, { value: "1", label: "Reporting currency" }] },
    { kind: "select", key: "taxYear", label: "Tax year", allLabel: "All years", options: TAX_YEAR_OPTIONS },
    { kind: "date", fromKey: "from", toKey: "to", label: "Dates" },
  ],
};
export const DIVIDEND_FILTER_KEYS = keysOf(DIVIDENDS_FILTER);

// ── realized gains ────────────────────────────────────────────────────────────────────────────────
const REALIZED_FILTER: FilterSortConfig = {
  fallbackReturnTo: "/portfolio/realized-gains",
  fields: [
    {
      kind: "select", key: "taxYear", label: "Tax year", allLabel: `Current year (${new Date().getFullYear()})`,
      options: [
        ...Array.from({ length: 3 }, (_, i) => {
          const y = String(new Date().getFullYear() - 1 - i);
          return { value: y, label: y };
        }),
        { value: "all", label: "All time" },
      ],
    },
    { kind: "segment", key: "term", label: "Term", options: [{ value: "", label: "All" }, { value: "short", label: "Short (≤365d)" }, { value: "long", label: "Long (>365d)" }] },
    { kind: "segment", key: "currency", label: "Currency", options: [{ value: "", label: "Native" }, { value: "unified", label: "In display currency" }] },
    { kind: "segment", key: "hideZero", label: "Zero-gain rows", options: [{ value: "", label: "Show all" }, { value: "1", label: "Hide zero-gain" }] },
    {
      kind: "segment", key: "groupMode", label: "Group by (display currency only)",
      options: [{ value: "", label: "Off" }, { value: "holding", label: "Holding" }, { value: "account", label: "Account" }, { value: "holding_account", label: "Both" }],
    },
  ],
};
export const REALIZED_FILTER_KEYS = keysOf(REALIZED_FILTER);

/** Filter pages served by /filter/[list]. */
export const FILTER_CONFIGS: Record<string, FilterSortConfig> = {
  accounts: ACCOUNTS_FILTER,
  categories: CATEGORIES_FILTER,
  goals: GOALS_FILTER,
  loans: LOANS_FILTER,
  subscriptions: SUBSCRIPTIONS_FILTER,
  holdings: HOLDINGS_FILTER,
  reports: REPORTS_FILTER,
  dividends: DIVIDENDS_FILTER,
  "realized-gains": REALIZED_FILTER,
};
