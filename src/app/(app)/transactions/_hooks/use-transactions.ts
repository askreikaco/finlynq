"use client";

/**
 * useTransactions: server-paged infinite list.
 *
 * Each page is one GET /api/transactions request in cursor mode
 * (`limit=50&cursor=<opaque|empty>`). The server filters, sorts and pages
 * (keyset cursor). Page 1 carries `total`. `hasMore` and `nextCursor` come
 * from the last loaded page. Pages load on `loadNextPage` (scroll sentinel).
 *
 * Filter, sort or column-filter changes change the SWR key, so the list starts
 * again at one page. `keepPreviousData` keeps the old rows on screen until the
 * new first page arrives (no empty flash).
 *
 * Shape of the return value is the same one the workspace has always used.
 * `isPartial` and `fullLoadError` are constant (false) for one release.
 */

import { useCallback, useMemo } from "react";
import useSWRInfinite from "swr/infinite";
import { jsonFetcher, swrListOptions } from "@/lib/swr";
import { buildTransactionQuery, type TxColFilter, type TxSortPref } from "@/lib/transactions/build-query";
import type { Account, ColFilterShape, SortPref, Transaction } from "../_types";

const PAGE = 50;

export const TX_PAGE_LIMIT = PAGE;

type TxPage = {
  data?: Transaction[];
  total?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type UseTransactionsFilters = {
  // FINLYNQ-177 — single-transaction id deep link.
  id?: string;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  categoryId?: string;
  search?: string;
  portfolioHolding?: string;
  tag?: string;
  direction?: string;
  minAmount?: string;
  maxAmount?: string;
};

export type UseTransactionsSortPref =
  | SortPref
  | {
      id?: string | null;
      desc?: boolean | null;
      columnId?: import("@/lib/transactions/columns").SortableColumnId | null;
      direction?: "asc" | "desc" | null;
    };

export type UseTransactionsColFilter =
  | ColFilterShape
  | { id: string; value: string[] }
  | { id?: string; columnId?: string; value?: unknown; values?: string[] };

/**
 * True when the view differs from the default recent-first list (any filter
 * value, any column filter, or a sort other than the default date DESC).
 * Used to decide whether to show the "Loading full history..." note while
 * the list is partial.
 */
export function isNonDefaultTxView(
  filters: UseTransactionsFilters,
  sortPref?: SortPref | null,
  colFilters?: readonly unknown[] | null,
): boolean {
  if (Object.values(filters ?? {}).some((v) => typeof v === "string" && v.trim() !== "")) {
    return true;
  }
  if (colFilters && colFilters.length > 0) return true;
  const col = sortPref?.columnId;
  if (col && !(col === "date" && sortPref?.direction !== "asc")) return true;
  return false;
}

/** Map the header sort (new or legacy shape) to the server's columnId + direction. */
function toServerSort(sortPref?: UseTransactionsSortPref): TxSortPref {
  const p = (sortPref ?? {}) as {
    columnId?: TxSortPref["columnId"];
    direction?: TxSortPref["direction"];
    id?: string | null;
    desc?: boolean | null;
  };
  const columnId = (p.columnId ?? p.id ?? null) as TxSortPref["columnId"];
  let direction: TxSortPref["direction"] = p.direction ?? null;
  if (direction == null && p.desc != null) direction = p.desc ? "desc" : "asc";
  if (!columnId || !direction) return { columnId: null, direction: null };
  return { columnId, direction };
}

export function useTransactions(
  filters: UseTransactionsFilters,
  sortPref?: UseTransactionsSortPref,
  colFilters?: UseTransactionsColFilter[],
  accounts?: Account[],
  _initialPage: number = 1,
) {
  const accountList = accounts ?? [];
  // accountType resolves to account ids on the client (build-query), so wait for accounts.
  const needsAccounts =
    (colFilters ?? []).some((f) => "type" in f && f.type === "enum" && f.columnId === "accountType");

  const getKey = (index: number, prev: TxPage | null) => {
    if (index > 0 && !prev?.nextCursor) return null;
    if (index === 0 && needsAccounts && accountList.length === 0) return null;
    const params = buildTransactionQuery(
      filters,
      toServerSort(sortPref),
      (colFilters ?? []).filter((f): f is TxColFilter => "type" in f) as TxColFilter[],
      accountList,
      { page: 0, limit: PAGE, cursor: index === 0 ? "" : prev?.nextCursor ?? "" },
    );
    return `/api/transactions?${params}`;
  };

  const { data, error, size, setSize, mutate } = useSWRInfinite<TxPage>(getKey, jsonFetcher, {
    ...swrListOptions,
    revalidateFirstPage: true,
    persistSize: false,
  });

  const pages = data ?? [];
  const first = pages[0];
  const last = pages[pages.length - 1];

  // Flatten, de-duplicate by id (offset shifts can repeat a row across pages).
  const txns = useMemo(() => {
    const seen = new Set<number>();
    const out: Transaction[] = [];
    for (const p of data ?? []) {
      for (const t of p.data ?? []) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [data]);

  const loading = !data && !error;
  const isLoadingMore = !error && data != null && data.length < size;
  const hasMore = Boolean(last?.hasMore);

  const loadNextPage = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    setSize((s) => (s > (data?.length ?? 0) ? s : s + 1));
  }, [hasMore, isLoadingMore, setSize, data]);

  const resetPage = useCallback(() => {
    void setSize(1);
  }, [setSize]);

  const loadTxns = useCallback(() => mutate(), [mutate]);

  return {
    txns,
    total: first?.total ?? 0,
    loading,
    limit: PAGE,
    loadError: Boolean(error) && !first,
    isPartial: false,
    fullLoadError: false,
    isLoadingMore,
    loadTxns,
    loadNextPage,
    resetPage,
    page: size,
    hasMore,
  };
}
