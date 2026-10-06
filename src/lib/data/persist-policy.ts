/**
 * Cache persistence policy: which API keys can be safely persisted to IndexedDB.
 *
 * Uses fail-closed ALLOW-LIST + BLOCK-LIST:
 * - Only keys matching PERSIST_ALLOWED AND not matching NEVER_PERSIST can persist
 * - Applied in: persistent-cache.ts (set/delete/hydration) and persist.ts (purge/hydration)
 * - Exported here to avoid circular imports
 */

/**
 * Allowed key prefixes (fail-closed). Only financial data + display preferences.
 * Derived from real SWR usage and routes at this commit:
 * accounts, categories, transactions, dashboard, portfolio, budgets, goals,
 * health-score, reports, fire, loans, subscriptions, recurring, age-of-money,
 * plus display-only settings: language, display-currency, tx-sort, etc.
 */
export const PERSIST_ALLOWED = new Set([
  "/api/accounts",
  "/api/budgets",
  "/api/categories",
  "/api/dashboard",
  "/api/fire",
  "/api/forecast",
  "/api/goals",
  "/api/health-score",
  "/api/loans",
  "/api/portfolio",
  "/api/recurring",
  "/api/reports",
  "/api/subscriptions",
  "/api/transactions",
  "/api/age-of-money",
  // Safe display-only settings (no credentials/secrets)
  "/api/settings/account-group-order",
  "/api/settings/active-currencies",
  "/api/settings/dashboard-layout",
  "/api/settings/dev-mode",
  "/api/settings/display-currency",
  "/api/settings/dropdown-order",
  "/api/settings/language",
  "/api/settings/reconcile-thresholds",
  "/api/settings/tx-columns",
  "/api/settings/tx-filters",
  "/api/settings/tx-sort",
]);

/**
 * Keys that must NEVER be persisted: auth/security/sensitive settings.
 */
export const NEVER_PERSIST = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/admin(\/|$)/,
  /^\/api\/oauth(\/|$)/,
  /^\/api\/family(\/|$)/,
  /^\/api\/import(\/|$)/,
  /^\/api\/prompts(\/|$)/,
  /^\/api\/feedback(\/|$)/,
  /^\/api\/chat(\/|$)/,
  /^\/api\/user(\/|$)/,
  /^\/api\/settings\/(sign-in-methods|devices|connected-apps|passkeys|recovery-codes|api-key|change-[a-z-]+|bank-feeds|backfill|email-retention|confirm-csv-mapping|reconcile-hidden-accounts|reporting-currency\/status)(\/|$)/,
];

export function normalizeKey(key: string): string {
  try {
    // Decode percent-encoding (handles %2F, %61uth, %zz, etc.)
    let normalized = decodeURIComponent(key);
    // Lower-case for consistent matching
    normalized = normalized.toLowerCase();
    // Remove fragment
    normalized = normalized.split("#")[0];
    // Remove query string
    normalized = normalized.split("?")[0];
    // Collapse multiple slashes
    normalized = normalized.replace(/\/+/g, "/");
    // Reject path traversal
    if (normalized.includes("..")) return "";
    // Strip all trailing slashes
    normalized = normalized.replace(/\/+$/, "");
    return normalized;
  } catch {
    // Decode failure (e.g., %zz): reject
    return "";
  }
}

export function isSafeToNeverPersist(key: string): boolean {
  if (typeof key !== "string") return false;

  const normalized = normalizeKey(key);
  if (!normalized || !normalized.startsWith("/api/")) return false;

  // Must match block-list (these should NEVER persist)
  return NEVER_PERSIST.some((pattern) => pattern.test(normalized));
}

export function isSafeToPersist(
  key: string,
  allowList: Set<string> = PERSIST_ALLOWED,
  blockList: RegExp[] = NEVER_PERSIST,
): boolean {
  if (typeof key !== "string") return false;

  const normalized = normalizeKey(key);
  if (!normalized || !normalized.startsWith("/api/")) return false;

  // Must NOT match block-list
  if (blockList.some((pattern) => pattern.test(normalized))) return false;

  // Must match allow-list prefix
  return Array.from(allowList).some((allowed) => normalized === allowed || normalized.startsWith(allowed + "/"));
}
