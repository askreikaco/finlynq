"use client";

import { Suspense } from "react";
import { TransactionsWorkspace } from "./_components/transactions-workspace";

// The full transactions surface (filters, per-column customize, header sort,
// multi-select bulk update/delete, CSV export, pagination, add/edit/split
// dialogs) lives in <TransactionsWorkspace> so it can be reused verbatim on the
// account detail page (DRY). This page just wraps it in the Suspense boundary
// that useSearchParams (inside the workspace) requires.

// Inline TableSkeleton kept only for the Suspense fallback below.
function TableSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 w-20 rounded animate-shimmer" />
          <div className="h-4 w-24 rounded animate-shimmer" />
          <div className="h-5 w-16 rounded-full animate-shimmer" />
          <div className="h-4 w-28 rounded animate-shimmer" />
          <div className="h-4 w-32 rounded animate-shimmer flex-1" />
          <div className="h-4 w-20 rounded animate-shimmer ml-auto" />
          <div className="h-6 w-14 rounded animate-shimmer" />
        </div>
      ))}
    </div>
  );
}

// useSearchParams requires Suspense. The workspace owns the page state + side
// effects; the default export just wraps it.
export default function TransactionsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <TransactionsWorkspace />
    </Suspense>
  );
}
