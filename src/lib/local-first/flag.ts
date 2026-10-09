/**
 * FINLYNQ_LOCAL_FIRST_DEV dev flag (local-first prototype P1). Default OFF; set to 1/true/yes/on to enable.
 * Read per call (runtime env) so a restart with the variable is enough.
 * Same parsing as isInstanceAdminEnabled in src/lib/admin/instance-flag.ts.
 */
export function isLocalFirstDevEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.FINLYNQ_LOCAL_FIRST_DEV?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
