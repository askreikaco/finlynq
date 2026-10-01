/**
 * Invisible accounts (2026-10-07).
 *
 * `accounts.invisible` hides an account from EVERY metric and total (net
 * worth, total assets/liabilities, reports, FX exposure, health score, recap,
 * family overview, MCP + mobile totals) while it stays listed and editable on
 * the Accounts page. `getAccountBalances` excludes invisible rows by default;
 * these helpers are for the few list-shaped payloads that carry them anyway
 * (rows flagged `invisible: true`) and then compute a total client-side.
 *
 * Pure — safe to import from client components.
 */

export type MaybeInvisible = { invisible?: boolean | null };

/** True when the row should count toward totals/metrics. */
export function countsInTotals(row: MaybeInvisible): boolean {
  return row.invisible !== true;
}

/** Drop invisible rows before summing. */
export function excludeInvisible<T extends MaybeInvisible>(rows: readonly T[]): T[] {
  return rows.filter(countsInTotals);
}

/**
 * Asset / liability / net-worth totals over balance rows, skipping invisible
 * accounts. `value` picks the figure to sum (e.g. converted balance).
 */
export function sumAssetsLiabilities<T extends MaybeInvisible & { accountType?: string | null }>(
  rows: readonly T[],
  value: (row: T) => number,
): { totalAssets: number; totalLiabilities: number; netWorth: number } {
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const r of rows) {
    if (!countsInTotals(r)) continue;
    if (r.accountType === "A") totalAssets += value(r);
    else if (r.accountType === "L") totalLiabilities += value(r);
  }
  return { totalAssets, totalLiabilities, netWorth: totalAssets + totalLiabilities };
}
