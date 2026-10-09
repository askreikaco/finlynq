/**
 * Validate a `?returnTo=` value for the account-groups page (/accounts/groups).
 *
 * Only same-origin, relative in-app paths pass: must start with a single "/",
 * no backslash, no whitespace or control characters (browsers strip those, so
 * "/\t/host" would become "//host"). Anything else falls back to `fallback`.
 */
export const GROUPS_RETURN_FALLBACK = "/accounts";

export function safeReturnTo(
  raw: string | null | undefined,
  fallback: string = GROUPS_RETURN_FALLBACK,
): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  if (/[\u0000- \u007f]/.test(raw)) return fallback;
  return raw;
}
