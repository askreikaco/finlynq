"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { CategoryForm } from "../../_components/category-form";

function RenameCategoryPage() {
  const params = useParams<{ id: string }>();
  const raw = params.id ?? "";
  const categoryId = /^\d+$/.test(raw) ? Number(raw) : null;
  return <CategoryForm mode="rename" categoryId={categoryId} />;
}

export default function EditCategoryRoute() {
  return (
    <Suspense fallback={null}>
      <RenameCategoryPage />
    </Suspense>
  );
}
