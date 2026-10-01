/**
 * Read-only queries for Family Wealth sections.
 *
 * These functions are ONLY called from src/app/api/family/overview/** and MUST NOT
 * perform any writes. Imported by overview route and section builders only.
 * Test ensures: no insert/update/delete/execute verbs in this file or its callers.
 *
 * Note: These are minimal placeholder implementations. Full implementations should
 * reuse existing queries from src/lib/queries.ts where possible.
 */

// Placeholder: these will be implemented with proper queries in the full version
export async function getAccountBalancesForUser(userId: string) {
  // TODO: Implement actual query from existing patterns
  return [];
}

export async function getNetWorthHistoryForUser(userId: string) {
  // TODO: Implement using snapshots query
  return [];
}

export async function getInvestmentHoldingsForUser(userId: string) {
  // TODO: Implement using portfolio snapshots and holdings
  return { snapshot: null, holdings: [] };
}

export async function getGoalsForUser(userId: string) {
  // TODO: Implement actual query
  return [];
}

export async function getBudgetsForUser(userId: string, month: string) {
  // TODO: Implement actual query
  return [];
}

export async function getLoansForUser(userId: string) {
  // TODO: Implement actual query
  return [];
}

export async function getCashflowForUser(userId: string, months: number = 12) {
  // TODO: Implement actual query
  return [];
}
