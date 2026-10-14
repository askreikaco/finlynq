"use client";

import { Suspense } from "react";
import { CategoryFormPanel } from "../../_components/category-form-panel";

export default function EditCategoryRoute() {
  return (
    <Suspense fallback={null}>
      <CategoryFormPanel mode="edit" />
    </Suspense>
  );
}
