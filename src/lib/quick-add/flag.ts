/**
 * FINLYNQ_QUICK_ADD flag (WP4). Default OFF; set to 1 to enable.
 * Read per call (runtime env, not inlined at build) so a restart with the variable is enough.
 * Enabled: FAB renders on /dashboard and /transactions (the Home quick-actions row was dropped in 13821dec and is not built).
 * (/api/auth/session reports quickAddEnabled).
 */
export function isQuickAddEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.FINLYNQ_QUICK_ADD?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Paths where the Quick-Add FAB should appear.
 */
export const QUICK_ADD_FAB_PATHS = ["/dashboard", "/transactions"];
