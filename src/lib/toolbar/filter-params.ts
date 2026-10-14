/** URL plumbing between a list page and its filter page (/<list>/search or /filter/<list>). */
import { safeReturnTo } from "@/lib/nav/return-to";
import { isDefaultSort, sortToParams, type SortOption, type SortState } from "./sort";

/** Filter page href for the current list URL: its params are carried along and `returnTo` points back. */
export function buildFilterHref(filterPath: string, current: { pathname: string; search: string }): string {
  const q = new URLSearchParams(current.search);
  q.delete("returnTo");
  q.set("returnTo", `${current.pathname}${current.search}`);
  return `${filterPath}?${q.toString()}`;
}

/**
 * The list URL after Apply / Reset: `returnTo` with the page-owned params (filters, sort, dir) replaced and
 * everything else (range, month, q, scope, accountId of a scoped page ...) kept.
 */
export function applyToReturnTo(
  returnTo: string,
  fallback: string,
  values: Record<string, string | undefined>,
  owned: readonly string[],
): string {
  const safe = safeReturnTo(returnTo, fallback);
  const [path, query = ""] = safe.split("?");
  const params = new URLSearchParams(query);
  for (const k of owned) params.delete(k);
  for (const [k, v] of Object.entries(values)) if (v != null && v !== "") params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Number of active filters (non-empty owned params) plus one for a non-default sort. */
export function countActive(
  get: (key: string) => string | null | undefined,
  filterKeys: readonly string[],
  sortState: SortState,
  sorts: readonly SortOption[],
): number {
  const n = filterKeys.filter((k) => (get(k) ?? "") !== "").length;
  return n + (sorts.length > 0 && !isDefaultSort(sortState, sorts) ? 1 : 0);
}

export { sortToParams };
