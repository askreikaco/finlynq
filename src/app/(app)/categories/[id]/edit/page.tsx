"use client";

import { CategoryFormPanel } from "../../_components/category-form-panel";

/** /categories/[id]/edit: the category + budget form as a page (id = a category, or a group id such as g-E-housing). */
export default function EditCategoryRoute() {
  return <CategoryFormPanel mode="edit" />;
}
