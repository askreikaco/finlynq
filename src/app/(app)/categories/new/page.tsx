"use client";

import { CategoryFormPanel } from "../_components/category-form-panel";

/** /categories/new: the category + budget form as a page (the /categories split view renders the same panel in its pane). */
export default function NewCategoryRoute() {
  return <CategoryFormPanel mode="create" />;
}
