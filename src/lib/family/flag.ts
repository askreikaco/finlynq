/**
 * FAMILY_WEALTH_ENABLED kill switch (plan P6). Default ON; set to 0/false/off/no to disable.
 * Read per call (runtime env, not inlined at build) so a restart with the variable is enough.
 * Disabled: middleware answers 404 for /family* pages and /api/family/*; the nav entry is hidden
 * (/api/auth/session reports familyWealthEnabled). Existing share rows are left untouched.
 */
export function isFamilyWealthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.FAMILY_WEALTH_ENABLED?.trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

export function isFamilyWealthPath(pathname: string): boolean {
  return (
    pathname === "/family" ||
    pathname.startsWith("/family/") ||
    pathname === "/api/family" ||
    pathname.startsWith("/api/family/")
  );
}
