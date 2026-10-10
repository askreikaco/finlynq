"use client";

/**
 * Level-2 portfolio operation route body (/portfolio/new/<slug>). The route file
 * src/app/(app)/portfolio/new/[op]/page.tsx is a server page that generates one static
 * param per OPS entry and renders this component. Each slug maps to its form component.
 */

import { Suspense, type ComponentType } from "react";
import BuyForm from "./BuyForm";
import SellForm from "./SellForm";
import SwapForm from "./SwapForm";
import TransferForm from "./TransferForm";
import IncomeExpenseForm from "./IncomeExpenseForm";
import FxConversionForm from "./FxConversionForm";
import DepositForm from "./DepositForm";
import WithdrawalForm from "./WithdrawalForm";
import { OPS, type OpDef } from "./op-catalog";

// Static imports keep each form's first render synchronous, as the old per-route pages were.
const FORM_BY_KEY: Record<OpDef["key"], ComponentType> = {
  buy: BuyForm,
  sell: SellForm,
  swap: SwapForm,
  transfer: TransferForm,
  "income-expense": IncomeExpenseForm,
  "fx-conversion": FxConversionForm,
  deposit: DepositForm,
  withdrawal: WithdrawalForm,
};

// Module-level map keyed by route slug (OPS.slug). Unknown slugs fall through to null.
const FORM_BY_SLUG: Partial<Record<string, ComponentType>> = Object.fromEntries(
  OPS.map((o) => [o.slug, FORM_BY_KEY[o.key]]),
);

export function OpRoute({ slug }: { slug: string }) {
  const Form = FORM_BY_SLUG[slug];
  if (!Form) return null;
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
