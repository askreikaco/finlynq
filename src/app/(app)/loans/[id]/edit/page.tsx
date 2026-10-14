"use client";

import { Suspense } from "react";
import { LoanFormPanel } from "../../_components/loan-form-panel";

export default function EditLoanRoute() {
  return (
    <Suspense fallback={null}>
      <LoanFormPanel mode="edit" />
    </Suspense>
  );
}
