"use client";

/**
 * useTransactions (Phase 4b: local-first client compute).
 *
 * SWR fetches /api/transactions?limit=100000 once; SWR's createPersistentCache
 * automatically encrypts and persists this payload to IndexedDB.
 *
 * Filtering, sorting, and pagination are executed entirely in the client via
 * useMemo on the cached transaction dataset for instant response without network
 * roundtrips.
 */

import { useMemo } from "react";
import useSWR from "swr";
import { jsonFetcher, swrListOptions } from "@/lib/swr";
import type { Account, ColFilterShape, SortPref, Transaction } from "../_types";

const limit = 50;

export const TX_PAGE_LIMIT = limit;

type TxListResponse = { data?: Transaction[]; total?: number };

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

export function useTransactions(
  filters: UseTransactionsFilters,
  sortPref?: UseTransactionsSortPref,
  colFilters?: UseTransactionsColFilter[],
  _accounts?: Account[],
  page: number = 1,
) {
  // 1. Fetch all transactions (limit=100000). Persisted and encrypted by SWR IndexedDB cache.
  const SWR_KEY = "/api/transactions?limit=100000";

  const { data, isLoading, isValidating, mutate } = useSWR<TxListResponse>(
    SWR_KEY,
    jsonFetcher,
    swrListOptions,
  );

  // 2. Replicate server-side filter and sort logic locally using useMemo
  const filteredTxns = useMemo(() => {
    const all = data?.data ?? [];
    if (!Array.isArray(all) || all.length === 0) return [];

    // Pre-parse filters for optimal performance across large arrays
    const accountIds = filters.accountId
      ? filters.accountId
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const categoryIds = filters.categoryId
      ? filters.categoryId
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const searchNeedle = filters.search?.toLowerCase().trim() || "";
    const portfolioNeedle = filters.portfolioHolding?.toLowerCase().trim() || "";
    const targetTags = filters.tag
      ? filters.tag
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    // Filter
    const filtered = all.filter((tx) => {
      // Date range filter
      if (filters.startDate && tx.date < filters.startDate) return false;
      if (filters.endDate && tx.date > filters.endDate) return false;

      // Account ID filter
      if (accountIds.length > 0 && !accountIds.includes(tx.accountId)) return false;

      // Category ID filter
      if (categoryIds.length > 0 && !categoryIds.includes(tx.categoryId)) return false;

      // Search filter (payee, note/notes, tags, or amount.toString())
      if (searchNeedle) {
        const payee = String(tx.payee ?? "").toLowerCase();
        const note = String((tx as any).note ?? (tx as any).notes ?? "").toLowerCase();
        const tags = String(tx.tags ?? "").toLowerCase();
        const amountStr = tx.amount != null ? String(tx.amount).toLowerCase() : "";
        const matches =
          payee.includes(searchNeedle) ||
          note.includes(searchNeedle) ||
          tags.includes(searchNeedle) ||
          amountStr.includes(searchNeedle);
        if (!matches) return false;
      }

      // Portfolio holding filter
      if (portfolioNeedle) {
        const ph = String(tx.portfolioHolding ?? "").toLowerCase();
        const phSym = String(tx.portfolioHoldingSymbol ?? "").toLowerCase();
        if (!ph.includes(portfolioNeedle) && !phSym.includes(portfolioNeedle)) {
          return false;
        }
      }

      // Tag filter
      if (targetTags.length > 0) {
        const rawTags = String(tx.tags ?? "").toLowerCase();
        const txTagsList = rawTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const hasTag = targetTags.some(
          (t) => txTagsList.includes(t) || rawTags.includes(t),
        );
        if (!hasTag) return false;
      }

      // Deep link single ID filter
      if (filters.id) {
        const parsedId = parseInt(filters.id, 10);
        if (Number.isFinite(parsedId) && tx.id !== parsedId) return false;
      }

      // Direction and amount range filters
      if ((filters as any).direction) {
        const dir = (filters as any).direction;
        if (dir === "in" && tx.amount < 0) return false;
        if (dir === "out" && tx.amount > 0) return false;
      }
      if ((filters as any).minAmount) {
        const min = parseFloat((filters as any).minAmount);
        if (Number.isFinite(min) && Math.abs(tx.amount) < min) return false;
      }
      if ((filters as any).maxAmount) {
        const max = parseFloat((filters as any).maxAmount);
        if (Number.isFinite(max) && Math.abs(tx.amount) > max) return false;
      }

      // Evaluate colFilters
      if (colFilters && colFilters.length > 0) {
        for (const cf of colFilters) {
          const colId = (cf as any).id ?? (cf as any).columnId;
          if (!colId) continue;

          // Check if value/values is an array (e.g. { id: 'accountName', value: string[] })
          const valArray = Array.isArray((cf as any).value)
            ? ((cf as any).value as string[])
            : Array.isArray((cf as any).values)
            ? ((cf as any).values as string[])
            : null;

          if (valArray) {
            if (valArray.length === 0) continue;
            if (colId === "accountName") {
              if (!valArray.includes(tx.accountName)) return false;
            } else if (colId === "account") {
              if (
                !valArray.includes(String(tx.accountId)) &&
                !valArray.includes(tx.accountName)
              ) {
                return false;
              }
            } else if (colId === "category" || colId === "categoryId") {
              if (
                !valArray.includes(String(tx.categoryId)) &&
                !valArray.includes(tx.categoryName)
              ) {
                return false;
              }
            } else if (colId === "categoryName") {
              if (!valArray.includes(tx.categoryName)) return false;
            } else if (colId === "source") {
              if (!valArray.includes(String(tx.source))) return false;
            } else if (colId === "accountType") {
              if (!valArray.includes(String(tx.accountType))) return false;
            } else {
              const rowVal = String((tx as any)[colId] ?? "");
              if (!valArray.includes(rowVal)) return false;
            }
            continue;
          }

          // Handle ColFilterShape discriminated union
          if ((cf as any).type === "enum") {
            const vals = (cf as any).values as string[];
            if (vals && vals.length > 0) {
              if (colId === "category") {
                if (!vals.includes(String(tx.categoryId))) return false;
              } else if (colId === "account") {
                if (!vals.includes(String(tx.accountId))) return false;
              } else if (colId === "source") {
                if (!vals.includes(String(tx.source))) return false;
              } else if (colId === "accountType") {
                if (!vals.includes(String(tx.accountType))) return false;
              } else {
                const rowVal = String((tx as any)[colId] ?? "");
                if (!vals.includes(rowVal)) return false;
              }
            }
          } else if ((cf as any).type === "text") {
            const filterText = String((cf as any).value ?? "").toLowerCase().trim();
            if (filterText) {
              const rowVal = String((tx as any)[colId] ?? "").toLowerCase();
              if (!rowVal.includes(filterText)) return false;
            }
          } else if ((cf as any).type === "date") {
            const from = (cf as any).from;
            const to = (cf as any).to;
            const rowDate = String((tx as any)[colId] ?? "");
            if (from && rowDate < from) return false;
            if (to && rowDate > to) return false;
          } else if ((cf as any).type === "numeric") {
            const op = (cf as any).op;
            const v = (cf as any).value;
            const v2 = (cf as any).value2;
            const numVal = Number((tx as any)[colId]);
            if (Number.isFinite(numVal) && Number.isFinite(v)) {
              if (op === "eq" && numVal !== v) return false;
              if (op === "gt" && numVal <= v) return false;
              if (op === "lt" && numVal >= v) return false;
              if (op === "between" && (numVal < v || (v2 != null && numVal > v2))) return false;
            }
          }
        }
      }

      return true;
    });

    // Sort by sortPref.id (property name) and sortPref.desc. Default to date DESC.
    // Add a stable tiebreaker (tx.id DESC).
    const sortId = (sortPref as any)?.id ?? (sortPref as any)?.columnId ?? "date";
    let isDesc = true;
    if ((sortPref as any)?.desc !== undefined) {
      isDesc = Boolean((sortPref as any).desc);
    } else if ((sortPref as any)?.direction !== undefined) {
      isDesc = (sortPref as any).direction === "desc" || (sortPref as any).direction == null;
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortId) {
        const valA = (a as any)[sortId];
        const valB = (b as any)[sortId];
        if (valA != null && valB != null) {
          if (typeof valA === "number" && typeof valB === "number") {
            cmp = valA - valB;
          } else {
            cmp = String(valA).localeCompare(String(valB));
          }
        } else if (valA != null) {
          cmp = 1;
        } else if (valB != null) {
          cmp = -1;
        }
      }

      if (cmp !== 0) {
        return isDesc ? -cmp : cmp;
      }

      // Stable tiebreaker: tx.id DESC
      return (b.id ?? 0) - (a.id ?? 0);
    });

    return filtered;
  }, [data?.data, filters, sortPref, colFilters]);

  // 3. Paginate the filtered array: const paginatedTxns = filteredTxns.slice(0, page * limit)
  const paginatedTxns = filteredTxns.slice(0, page * limit || limit);

  // 4. Return { txns: paginatedTxns, total: filteredTxns.length, loading: isLoading || isValidating, limit, loadTxns: mutate }
  return {
    txns: paginatedTxns,
    total: filteredTxns.length,
    loading: isLoading || isValidating,
    limit,
    loadTxns: mutate,
  };
}
