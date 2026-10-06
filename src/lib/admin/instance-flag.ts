/**
 * FINLYNQ_INSTANCE_ADMIN kill switch (WP9a). Default OFF; set to 1/true/yes/on to enable.
 * Read per call (runtime env, not inlined at build) so a restart with the variable is enough.
 * Disabled: middleware answers 404 for /admin/instance pages; the nav entry is hidden
 * (server-side prop passing to Nav/MoreMenu). Existing instance config is left untouched.
 */
export function isInstanceAdminEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.FINLYNQ_INSTANCE_ADMIN?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isInstanceAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin/instance" ||
    pathname.startsWith("/admin/instance/") ||
    pathname === "/api/admin/instance" ||
    pathname.startsWith("/api/admin/instance/")
  );
}
