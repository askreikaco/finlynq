"use client";

import { FormPage } from "@/components/templates/form-page";
import { CategoryForm, CATEGORY_RETURN_FALLBACK } from "../_components/category-form";

export default function NewCategoryPage() {
  return (
    <FormPage
      id="category-form"
      title="New category"
      fallbackReturn={CATEGORY_RETURN_FALLBACK}
      form="external"
      padBottom="none"
      header={{ actions: null }}
    >
      {() => <CategoryForm mode="create" chrome={false} />}
    </FormPage>
  );
}
