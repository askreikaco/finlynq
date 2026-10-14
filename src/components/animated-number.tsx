"use client";

import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";

/**
 * A currency amount, painted at its final value at once. No count-up from 0: a metric card painted from the
 * on-device cache must show the cached figure on the first frame and swap in the revalidated figure in place.
 */
export function AnimatedNumber({ value, currency }: { value: number; currency?: string }) {
  const { displayCurrency } = useDisplayCurrency();
  const resolvedCurrency = currency?.trim() ? currency : displayCurrency;
  return <span>{formatCurrency(value, resolvedCurrency)}</span>;
}
