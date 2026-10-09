"use client";

/** Level-2 page: Brokerage deposit (/portfolio/new/deposit). Form logic lives in DepositForm. */

import { Suspense } from "react";
import DepositForm from "@/components/portfolio/forms/DepositForm";

export default function PortfolioNewDepositPage() {
  return (
    <Suspense fallback={null}>
      <DepositForm />
    </Suspense>
  );
}
