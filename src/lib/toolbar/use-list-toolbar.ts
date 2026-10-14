"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { buildFilterHref, countActive } from "./filter-params";
import { parseSort, type SortOption, type SortState } from "./sort";

export interface ListToolbarOptions {
  /** Filter page path, e.g. "/filter/goals" or "/transactions/search". */
  filterPath: string;
  /** Sort options of the list (empty = no sort section). */
  sorts?: readonly SortOption[];
  /** URL params owned by the filter page (each counts as one active filter when non-empty). */
  filterKeys?: readonly string[];
  /** Query param of the search box. Default "q". */
  searchParam?: string;
}

export interface ListToolbarState {
  /** Search text (local state mirrored to the URL with replaceState). */
  q: string;
  setQ: (next: string) => void;
  sort: SortState;
  /** True when ?sort= or ?dir= is in the URL (a page with its own default order keeps it otherwise). */
  sortExplicit: boolean;
  /** Filter-page params currently in the URL. */
  filters: Record<string, string>;
  activeCount: number;
  /** Filter page href for the CURRENT address (read at click time, so range / q changes are included). */
  filterHref: () => string;
}

/**
 * Search, sort and filter state of a list page. It lives in the URL (?q=, ?sort=, ?dir= and the filter-page keys) so a
 * view is shareable and the same params feed the local-first query path. The range slot keeps its own hook
 * (useMetricRange), because the metric cards read it too.
 */
export function useListToolbar({ filterPath, sorts = [], filterKeys = [], searchParam = "q" }: ListToolbarOptions): ListToolbarState {
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "";
  const [q, setQState] = useState(() => searchParams?.get(searchParam) ?? "");
  const setQ = useCallback(
    (next: string) => {
      setQState(next);
      try {
        const url = new URL(window.location.href);
        if (next) url.searchParams.set(searchParam, next);
        else url.searchParams.delete(searchParam);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      } catch {
        /* URL sync is a convenience; the list still follows the state. */
      }
    },
    [searchParam],
  );
  const get = useCallback((k: string) => searchParams?.get(k), [searchParams]);
  const sort = useMemo(() => parseSort(get, sorts), [get, sorts]);
  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of filterKeys) {
      const v = searchParams?.get(k);
      if (v) out[k] = v;
    }
    return out;
  }, [searchParams, filterKeys]);
  const activeCount = countActive(get, filterKeys, sort, sorts);
  const filterHref = useCallback(() => {
    if (typeof window === "undefined") return buildFilterHref(filterPath, { pathname, search: "" });
    return buildFilterHref(filterPath, { pathname: window.location.pathname, search: window.location.search });
  }, [filterPath, pathname]);
  const sortExplicit = !!(searchParams?.get("sort") || searchParams?.get("dir"));
  return { q, setQ, sort, sortExplicit, filters, activeCount, filterHref };
}
