"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { CategoryDetail } from "../_components/category-detail";

/**
 * /categories/[id]: the category (or group, id `g-E-housing`) detail page. The content is CategoryDetail, shared with
 * the /categories split-view pane.
 */
export default function CategoryPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<PageSkeleton variant="list" rows={4} />}>
      <CategoryDetail id={id} />
    </Suspense>
  );
}
