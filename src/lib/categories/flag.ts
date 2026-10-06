/**
 * FINLYNQ_CATEGORIES_MERGED kill switch for merged categories hub (WP8). Default OFF.
 * When enabled, /categories becomes a unified hub with tabs for overview, management, and rules.
 * Set to 1/true/on/yes to enable; anything else disables.
 */
export function isCategoriesMergedEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.FINLYNQ_CATEGORIES_MERGED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}
