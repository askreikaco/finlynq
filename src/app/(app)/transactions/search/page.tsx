"use client";

import { FilterSortPage } from "@/components/filter-sort-page";
import { TRANSACTIONS_FILTER } from "@/lib/toolbar/list-configs";

/** Filter + sort page of the transactions list (opened from the PageToolbar funnel; returnTo carries the list URL). */
export default function TransactionFilterPage() {
  return <FilterSortPage config={TRANSACTIONS_FILTER} />;
}
