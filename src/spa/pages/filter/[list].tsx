"use client";

/** Client twin of src/app/(app)/filter/[list]/page.tsx (async server page: `await params`, notFound()). */
import { Suspense } from "react";
import { useParams, notFound } from "next/navigation";
import { Notice } from "@/components/notice";
import { FilterListPage } from "@/components/filter-sort-page";
import { FILTER_CONFIGS } from "@/lib/toolbar/list-configs";

export default function FilterPage() {
  const { list = "" } = useParams<{ list: string }>();
  if (!Object.prototype.hasOwnProperty.call(FILTER_CONFIGS, list)) notFound();
  return (
    <Suspense fallback={<Notice variant="skeleton" skeleton="list" rows={4} />}>
      <FilterListPage list={list} />
    </Suspense>
  );
}
