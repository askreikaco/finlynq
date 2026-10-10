/**
 * Validate a `?returnTo=` value (or any in-app redirect target).
 *
 * Only same-origin, relative in-app paths pass: must start with a single "/",
 * no backslash, no whitespace or control characters (browsers strip those, so
 * "/\t/host" would become "//host"). Anything else falls back to `fallback`.
 *
 * Moved verbatim from src/lib/accounts/groups-return-to.ts (C-03); that module
 * re-exports this one so existing importers are unchanged.
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
