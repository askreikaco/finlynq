"use client";

import { Suspense } from "react";
import { LoanFormPanel } from "../_components/loan-form-panel";

export default function NewLoanRoute() {
  return (
    <Suspense fallback={null}>
      <LoanFormPanel mode="create" />
    </Suspense>
  );
}
