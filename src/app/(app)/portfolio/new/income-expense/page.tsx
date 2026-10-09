"use client";

/** Level-2 page: Income / expense (/portfolio/new/income-expense). Form logic lives in IncomeExpenseForm. */

import { Suspense } from "react";
import IncomeExpenseForm from "@/components/portfolio/forms/IncomeExpenseForm";

export default function PortfolioNewIncomeExpensePage() {
  return (
    <Suspense fallback={null}>
      <IncomeExpenseForm />
    </Suspense>
  );
}
