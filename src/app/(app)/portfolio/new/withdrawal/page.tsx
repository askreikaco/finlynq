"use client";

/** Level-2 page: Brokerage withdrawal (/portfolio/new/withdrawal). Form logic lives in WithdrawalForm. */

import { Suspense } from "react";
import WithdrawalForm from "@/components/portfolio/forms/WithdrawalForm";

export default function PortfolioNewWithdrawalPage() {
  return (
    <Suspense fallback={null}>
      <WithdrawalForm />
    </Suspense>
  );
}
