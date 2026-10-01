/**
 * Mask an account identity for display in pre-auth pickers: first character,
 * fixed-length star run (never leaks the length), email domain kept.
 * "alice@example.com" -> "a***@example.com"; username "alice" -> "a***".
 */
export function maskIdentity(email: string | null | undefined, username?: string | null): string {
  const e = (email ?? "").trim();
  const at = e.indexOf("@");
  if (at > 0) return `${e[0]}***${e.slice(at)}`;
  const u = (username ?? "").trim();
  return u ? `${u[0]}***` : "***";
}
