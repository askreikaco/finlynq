"use client";

import { Suspense } from "react";
import { CategoryForm } from "../_components/category-form";

export default function NewCategoryPage() {
  return (
    <Suspense fallback={null}>
      <CategoryForm mode="create" />
    </Suspense>
  );
}
