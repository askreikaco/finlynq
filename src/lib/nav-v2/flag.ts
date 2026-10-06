/**
 * FINLYNQ_NAV_V2 kill switch for navigation v2 features. Default OFF.
 * Enables settings/account hubs as iOS grouped lists (WP7).
 * Set to 1/true/yes to enable.
 * Read per call (runtime env, not inlined at build) so a restart with the variable is enough.
 */
export function isNavV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.FINLYNQ_NAV_V2?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
