"use client";

import { Suspense } from "react";
import { BudgetFormPanel } from "../_components/budget-form-panel";

export default function NewBudgetRoute() {
  return (
    <Suspense fallback={null}>
      <BudgetFormPanel />
    </Suspense>
  );
}
