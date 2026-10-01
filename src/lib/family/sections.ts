/**
 * Family Wealth sections registry — data blocks visible in the shared Family Wealth page.
 *
 * FAMILY_SECTIONS_V1 is the single source of truth for:
 * - zod enum of section names
 * - UI checklist (share dialog, permission confirmations)
 * - DTO builders (what each section contains)
 * - Label-registry allow-list membership
 *
 * Changes to this list require P4 (full overview endpoint) to add builders.
 * P1 defines the schema only; P4 adds the endpoint and builders.
 */

import { z } from "zod";

/**
 * Supported family sharing sections.
 * Each section is a data block of the single Family Wealth overview page.
 * Viewers granted a section see plaintext numbers + that section's labels only.
 * Net worth is disclosed (owner decision); if shared with one member only,
 * the summary implies unshared sections.
 */
export const FAMILY_SECTIONS_V1 = [
  "net_worth",    // net worth, assets, liabilities totals + history series
  "accounts",     // accounts and balances (label, type, group, currency, balance)
  "investments",  // holdings value, allocation by asset_type, trend
  "goals",        // name, target, progress, deadline
  "budgets",      // category budget vs actual (month)
  "loans",        // name, principal, rate, balance/payoff
  "cashflow",     // income/expense summary + monthly trend (aggregates only)
] as const;

export type FamilySection = (typeof FAMILY_SECTIONS_V1)[number];

/**
 * Sections retired from the Family overview (2026-10): no longer offered in the share /
 * change-sections checklists, not built by the overview endpoint and not rendered. They stay in
 * FAMILY_SECTIONS_V1 (zod enum, CHECK constraints, label registry) so existing share rows that
 * contain them remain valid; they are simply ignored by the overview.
 */
export const FAMILY_HIDDEN_SECTIONS: readonly FamilySection[] = ["accounts", "goals", "budgets"];

/** Sections the Family overview builds, renders and offers for new shares (registry order). */
export const FAMILY_OVERVIEW_SECTIONS: readonly FamilySection[] = FAMILY_SECTIONS_V1.filter(
  (s) => !FAMILY_HIDDEN_SECTIONS.includes(s),
);

export function isOverviewSection(s: string): s is FamilySection {
  return FAMILY_OVERVIEW_SECTIONS.includes(s as FamilySection);
}

/**
 * Zod enum for validation, form handling, and API contracts.
 */
export const FamilySectionSchema = z.enum(FAMILY_SECTIONS_V1);

/**
 * User-facing section names (keys for i18n strings.ts).
 */
export const SECTION_DISPLAY_NAMES: Record<FamilySection, string> = {
  net_worth: "Net Worth",
  accounts: "Accounts",
  investments: "Investments",
  goals: "Goals",
  budgets: "Budgets",
  loans: "Loans",
  cashflow: "Cashflow",
};

/**
 * Section descriptions for the share dialog (owner decision: net worth is disclosed).
 */
export const SECTION_DESCRIPTIONS: Record<FamilySection, string> = {
  net_worth: "Total net worth, assets, and liabilities + historical trend",
  accounts: "Account list with names, types, and balances",
  investments: "Investment performance (value, cost basis, returns)",
  goals: "Savings goals with targets and progress",
  budgets: "Budget categories with spending vs targets",
  loans: "Loans with balances and payoff schedules",
  cashflow: "Monthly income, expenses and savings rate",
};

/**
 * Sections that contain member names (used to build generic labels if sidecar is unavailable).
 * These are the entity_types allowed in family_labels for the section.
 */
export const SECTION_ENTITY_TYPES: Record<FamilySection, string[]> = {
  net_worth: [],  // no labels
  accounts: ["accounts"],
  investments: ["portfolio_holdings"],
  goals: ["goals"],
  budgets: ["categories"],
  loans: ["loans"],
  cashflow: ["categories"],
};

/**
 * Default viewer display currency (overridable per request).
 * Used if the viewer has not set a display_currency preference.
 */
export const DEFAULT_VIEWER_CURRENCY = "CAD";

/**
 * Status values that represent an "active" share (viewer can access data).
 */
export const ACTIVE_SHARE_STATUSES = ["active", "awaiting_owner_unlock"] as const;

/**
 * Status values that represent share completion (not pending).
 */
export const TERMINAL_SHARE_STATUSES = [
  "revoked",
  "declined",
  "expired",
  "key_reset",
] as const;

/**
 * Check if a share status permits data access.
 */
export function isShareActive(status: string): boolean {
  return ACTIVE_SHARE_STATUSES.includes(status as typeof ACTIVE_SHARE_STATUSES[number]);
}

/**
 * Resolve "view all" to an explicit section list.
 * If allSections=true, return the full FAMILY_SECTIONS_V1 list.
 * Otherwise return the provided sections array.
 */
export function resolveSections(
  allSections: boolean,
  sections: string[],
): FamilySection[] {
  if (allSections) {
    return Array.from(FAMILY_SECTIONS_V1);
  }
  return sections.filter(
    (s): s is FamilySection =>
      FAMILY_SECTIONS_V1.includes(s as FamilySection),
  );
}
