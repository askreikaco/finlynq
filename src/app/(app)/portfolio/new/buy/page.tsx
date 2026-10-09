"use client";

/** Level-2 page: Buy (/portfolio/new/buy). Form logic lives in BuyForm. */

import { Suspense } from "react";
import BuyForm from "@/components/portfolio/forms/BuyForm";

export default function PortfolioNewBuyPage() {
  return (
    <Suspense fallback={null}>
      <BuyForm />
    </Suspense>
  );
}
