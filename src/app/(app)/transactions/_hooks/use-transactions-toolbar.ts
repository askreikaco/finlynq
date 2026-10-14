"use client";

import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { TRANSACTION_FILTER_KEYS, TRANSACTION_SORTS } from "@/lib/toolbar/list-configs";

/** Range + search + sort/filter state of the transactions toolbar (URL: ?range= ?month= ?from= ?to= ?search= ?sort= ?dir=). */
export function useTransactionsToolbar() {
  const range = useMetricRange();
  const list = useListToolbar({ filterPath: "/transactions/search", sorts: TRANSACTION_SORTS, filterKeys: TRANSACTION_FILTER_KEYS, searchParam: "search" });
  return { range, list };
}
export type TransactionsToolbarState = ReturnType<typeof useTransactionsToolbar>;

