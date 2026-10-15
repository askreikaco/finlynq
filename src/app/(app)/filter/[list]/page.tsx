import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { notFound } from "next/navigation";
import { FilterListPage } from "@/components/filter-sort-page";
import { FILTER_CONFIGS } from "@/lib/toolbar/list-configs";

/** The filter + sort page of a list: /filter/<list>?returnTo=/<list>. Lists are declared in lib/toolbar/list-configs. */
export default async function FilterPage({ params }: { params: Promise<{ list: string }> }) {
  const { list } = await params;
  if (!Object.prototype.hasOwnProperty.call(FILTER_CONFIGS, list)) notFound();
  return (
    <Suspense fallback={<Notice variant="skeleton" skeleton="list" rows={4} />}>
      <FilterListPage list={list} />
    </Suspense>
  );
}
