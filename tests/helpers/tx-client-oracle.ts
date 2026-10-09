/**
 * Test-only oracle: the client-side filter + sort of the Transactions page.
 *
 * Body copied verbatim from src/app/(app)/transactions/_hooks/use-transactions.ts
 * lines 117-340 (the useMemo callback of `filteredTxns`, the source of
 * "today's" UI behaviour). Only change: the source array is bound to a local
 * `sourceRows` so the body is unchanged and React-free. Do not edit the body;
 * re-copy it when the hook changes. Server parity tests compare against this.
  */
/* eslint-disable @typescript-eslint/no-explicit-any -- verbatim copy of the hook body */
import type {
  UseTransactionsColFilter,
  UseTransactionsFilters,
  UseTransactionsSortPref,
} from "@/app/(app)/transactions/_hooks/use-transactions";
import type { Transaction } from "@/app/(app)/transactions/_types";

export function oracleFilterSort(
  rows: Transaction[] | null | undefined,
  filters: UseTransactionsFilters,
  sortPref?: UseTransactionsSortPref,
  colFilters?: UseTransactionsColFilter[],
): Transaction[] {
  const sourceRows = rows;
    const all = sourceRows ?? [];
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
}
