/**
 * Categories overview — level-1 grouping (pure, no React).
 *
 * The "By category" card shows two levels: one row per top-level `group`
 * (e.g. Housing, Transport) and, inside a group, its categories. A category
 * with no group (`group === ""`) is its own level-1 row and opens the detail
 * page directly.
 *
 * Inputs are the `OverviewCategory` rows from GET /api/reports/categories, so
 * every number here is already in the display currency for the selected month.
 */

import type { OverviewCategory } from "@/lib/reports/category-overview";

export interface OverviewRow {
  /** "group" drills into its categories; "category" is an ungrouped category that opens its detail page. */
  kind: "group" | "category";
  /** Stable React / drill key: `g:<group>` or `c:<categoryId>`. */
  key: string;
  /** Group name, or the category name for an ungrouped row. */
  label: string;
  /** Group name; "" for an ungrouped category. */
  group: string;
  /** Selected-month amount (sum of members). */
  amount: number;
  /** amount ÷ month total (0..1). */
  share: number;
  /** Sum of member averages (members with no average count as 0); null when no member has one. */
  average: number | null;
  /**
   * Change vs usual, over the members that have an average only:
   * (their amount − their average) ÷ |their average|. Null without an average.
   */
  change: number | null;
  /** Sum of member budgets; null when no member has a budget. */
  budget: number | null;
  /** Element-wise sum of member trends (oldest first); null when there is no trend. */
  trend: number[] | null;
  /** Members, sorted as the API sorts them (amount desc). */
  categories: OverviewCategory[];
}

export const GROUP_KEY_PREFIX = "g:";
export const CATEGORY_KEY_PREFIX = "c:";

/**
 * Build the level-1 rows. `total` is the selected month's total (the API's
 * `total`), used for `share`. Sorted by amount desc, ties by average desc.
 */
export function buildGroupRows(categories: OverviewCategory[], total: number): OverviewRow[] {
  const buckets = new Map<string, OverviewCategory[]>();
  for (const c of categories) {
    const key = c.group ? `${GROUP_KEY_PREFIX}${c.group}` : `${CATEGORY_KEY_PREFIX}${c.id}`;
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  }

  const rows: OverviewRow[] = [];
  for (const [key, members] of buckets) {
    const grouped = key.startsWith(GROUP_KEY_PREFIX);
    const amount = sum(members.map((m) => m.amount));
    const withAvg = members.filter((m) => m.average != null);
    const avgMembers = withAvg.length > 0 ? sum(withAvg.map((m) => m.average as number)) : null;
    const change = avgMembers
      ? (sum(withAvg.map((m) => m.amount)) - avgMembers) / Math.abs(avgMembers)
      : null;
    const withBudget = members.filter((m) => m.budget != null);
    rows.push({
      kind: grouped ? "group" : "category",
      key,
      label: grouped ? members[0].group : (members[0].name ?? "Category"),
      group: members[0].group,
      amount,
      share: total > 0 ? amount / total : 0,
      average: avgMembers,
      change: change != null && Number.isFinite(change) ? change : null,
      budget: withBudget.length > 0 ? sum(withBudget.map((m) => m.budget as number)) : null,
      trend: sumSeries(members.map((m) => m.trend)),
      categories: members,
    });
  }

  rows.sort((a, b) => b.amount - a.amount || (b.average ?? 0) - (a.average ?? 0));
  return rows;
}

/** Element-wise sum; series may differ in length (missing points count as 0). Null when there are none. */
export function sumSeries(series: number[][]): number[] | null {
  const len = series.reduce((m, s) => Math.max(m, s.length), 0);
  if (len === 0) return null;
  const out = new Array<number>(len).fill(0);
  for (const s of series) for (let i = 0; i < s.length; i++) out[i] += s[i];
  return out;
}

/**
 * Name of a level-2 row without the redundant group prefix:
 * "Housing - Rent" in group "Housing" → "Rent". Other names are returned as-is.
 */
export function subLabel(name: string | null, group: string): string {
  const full = name ?? "Category";
  const prefix = `${group} - `;
  return group && full.startsWith(prefix) && full.length > prefix.length ? full.slice(prefix.length) : full;
}

/**
 * Pie slices: the top `max` active rows (amount > 0), plus "Other" for the rest.
 * `other` is 0 when nothing is left over.
 */
export function pieSlices(rows: OverviewRow[], max = 7): { slices: OverviewRow[]; other: number } {
  const active = rows.filter((r) => r.amount > 0);
  return {
    slices: active.slice(0, max),
    other: sum(active.slice(max).map((r) => r.amount)),
  };
}

/** Level-1 row by key, or null when the key is not (any longer) in the list. */
export function findRow(rows: OverviewRow[], key: string | null): OverviewRow | null {
  if (key == null) return null;
  return rows.find((r) => r.key === key) ?? null;
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}
