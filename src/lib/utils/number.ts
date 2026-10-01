import { formatFixed } from "@/lib/locale";

/**
 * Shared numeric utilities.
 *
 * Canonical home for `round2` — the half-up-to-2-decimals helper used across
 * write paths, aggregators, and API routes. Historically every module that
 * needed it declared its own private `const round2 = (n) => Math.round(n*100)/100`;
 * FINLYNQ-145 consolidated them here. `currency-conversion.ts` re-exports this
 * so existing `import { round2 } from "@/lib/currency-conversion"` callsites keep
 * working unchanged.
 *
 * NOTE: `src/lib/loan-calculator.ts` intentionally keeps its OWN private copy —
 * it is bundled into the MCP build and must stay dependency-free. Do not point
 * it here.
 */

/** Round a number to 2 decimal places (currency precision). */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Upper magnitude bound for any user-supplied financial figure (amount,
 * quantity, price). A trillion in any currency is already absurd for a
 * personal-finance ledger; values past this (e.g. `1e29` from a malformed
 * import file) are rejected at the import preview boundary rather than
 * silently accepted and stored. FINLYNQ-159.
 */
export const MAX_REASONABLE_AMOUNT = 1e12;

/**
 * True when `n` is a finite number within the sane magnitude bound
 * (|n| <= {@link MAX_REASONABLE_AMOUNT}). Rejects NaN, ±Infinity, and
 * out-of-range magnitudes. Use at the import parse/preview boundary to
 * flag garbage numeric fields before they reach the ledger. FINLYNQ-159.
 */
export const isReasonableAmount = (n: number): boolean =>
  Number.isFinite(n) && Math.abs(n) <= MAX_REASONABLE_AMOUNT;

/**
 * Compact chart-axis abbreviation — the SINGLE source of truth for
 * "K"/"M"/"B" Y-axis tick formatting (FINLYNQ-247). Deliberately bare (NO
 * currency symbol — currency belongs on a chart-level label/subtitle, not
 * every tick) so it composes with any chart regardless of currency.
 *
 * Rules:
 *   - |n| >= 1e9 → "<n/1e9 to 1 decimal>B"  (e.g. 2_500_000_000 → "2.5B")
 *   - |n| >= 1e6 → "<n/1e6 to 1 decimal>M"  (e.g. 54_300_000 → "54.3M")
 *   - |n| >= 1e4 → "<n/1e3 to 0 decimals>K" (e.g. 572345 → "572K")
 *   - |n| >= 1e3 → "<n/1e3 to 1 decimal>K"  (e.g. 1500 → "1.5K")
 *   - else       → the rounded value as a plain string (e.g. 850 → "850")
 * Negative-safe (sign carried through, magnitude rules applied to |n|) and
 * 0-safe ("0").
 */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${formatFixed(value / 1e9, 1)}B`;
  if (abs >= 1e6) return `${formatFixed(value / 1e6, 1)}M`;
  if (abs >= 1000) return `${formatFixed(value / 1000, abs >= 10000 ? 0 : 1)}K`;
  return `${Math.round(value)}`;
}
