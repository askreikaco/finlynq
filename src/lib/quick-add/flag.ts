/**
 * FINLYNQ_QUICK_ADD flag (WP4). Default OFF; set to 1 to enable.
 * Read per call (runtime env, not inlined at build) so a restart with the variable is enough.
 * Enabled: FAB and quick-actions row render on /dashboard and /transactions.
 * (/api/auth/session reports quickAddEnabled).
 */
export function isQuickAddEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.FINLYNQ_QUICK_ADD?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
