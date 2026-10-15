"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Notice } from "@/components/notice";
import { CategoryDetail } from "../_components/category-detail";

/**
 * /categories/[id]: the category (or group, id `g-E-housing`) detail page. The content is CategoryDetail, shared with
 * the /categories split-view pane.
 */
export default function CategoryPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Notice variant="skeleton" skeleton="list" rows={4} />}>
      <CategoryDetail id={id} />
    </Suspense>
  );
}
