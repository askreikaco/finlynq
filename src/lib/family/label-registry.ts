/**
 * Label decryption allow-list for family sharing.
 *
 * Specifies which tables/columns in each section are eligible for decryption
 * and inclusion in the family_labels sidecar. This is a strict allowlist:
 * unregistered columns are NEVER decrypted, even if the source entity exists.
 *
 * Columns in the sidecar come from ONE table per section (the primary entity source).
 * P1 defines the registry; P2+ may widen it.
 *
 * Never includes payee, note, tags, alias, rules, or free-text fields.
 * Never includes columns from non-shared sections.
 */

import { FamilySection } from "./sections";

/**
 * Registered source column for each section.
 * Key: section name; value: { table, column } or null if section has no labels.
 */
export const SECTION_LABEL_SOURCES: Record<
  FamilySection,
  { table: string; column: string } | null
> = {
  net_worth: null,      // net worth section has no entity labels
  accounts: { table: "accounts", column: "name_ct" },
  investments: { table: "portfolio_holdings", column: "name_ct" },
  goals: { table: "goals", column: "name_ct" },
  budgets: { table: "categories", column: "name_ct" },
  loans: { table: "loans", column: "name_ct" },
  cashflow: { table: "categories", column: "name_ct" },
};

/**
 * Validate that a decryption request matches the allow-list.
 * Returns true if the (section, entity_type, column) tuple is registered.
 * Returns false otherwise (unregistered columns are silently treated as "no label").
 */
export function isLabelRegistered(
  section: string,
  entityType: string,
  column: string,
): boolean {
  const source = SECTION_LABEL_SOURCES[section as FamilySection];
  if (!source) return false;
  if (source.table !== entityType) return false;
  if (source.column !== column) return false;
  return true;
}

/**
 * Get the registered source for a section, or null if section has no labels.
 */
export function getRegisteredSource(section: string): {
  table: string;
  column: string;
} | null {
  return SECTION_LABEL_SOURCES[section as FamilySection] || null;
}

/**
 * Entity types eligible for label decryption per section.
 */
export const SECTION_ENTITY_TYPES: Record<FamilySection, string[]> = {
  net_worth: [],
  accounts: ["accounts"],
  investments: ["portfolio_holdings"],
  goals: ["goals"],
  budgets: ["categories"],
  loans: ["loans"],
  cashflow: ["categories"],
};

/**
 * Extract the label name from a database row via the registered column.
 * Returns the decrypted label, or a generic fallback if no label found.
 *
 * Example:
 *   row = { id: 5, name_ct: "encrypted...", ... }
 *   section = "accounts"
 *   => { label: "decrypted...", isGeneric: false }
 *
 * Returns:
 *   { label: "Account #5", isGeneric: true } if source not found
 */
export function extractLabelFromRow(
  row: Record<string, unknown>,
  section: string,
): { label: string; isGeneric: boolean } {
  const source = SECTION_LABEL_SOURCES[section as FamilySection];
  if (!source) {
    return { label: "", isGeneric: false };
  }

  // Get the column from the row
  const labelValue = row[source.column] || row[toCamelCase(source.column)];
  if (!labelValue || typeof labelValue !== "string") {
    // Fallback: generic label from id and type
    const id = row.id || row.entityId || "?";
    const type = section.replace(/_/g, " ");
    return {
      label: `${type.charAt(0).toUpperCase() + type.slice(1)} #${id}`,
      isGeneric: true,
    };
  }

  return { label: labelValue, isGeneric: false };
}

/**
 * Convert snake_case to camelCase (e.g., name_ct -> nameCt).
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}
