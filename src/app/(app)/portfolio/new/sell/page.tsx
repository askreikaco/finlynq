"use client";

/** Level-2 page: Sell (/portfolio/new/sell). Form logic lives in SellForm. */

import { Suspense } from "react";
import SellForm from "@/components/portfolio/forms/SellForm";

export default function PortfolioNewSellPage() {
  return (
    <Suspense fallback={null}>
      <SellForm />
    </Suspense>
  );
}
