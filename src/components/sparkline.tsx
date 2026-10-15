"use client";

/**
 * TEMPORARY re-export for metric-card.tsx and mobile/progress-row.tsx (rewritten by another agent; they still import
 * `Sparkline` from here). Delete this file once they render <Chart kind="sparkline" values labels color /> directly.
 */

import { Chart } from "@/components/chart";

export function Sparkline({
  data,
  color,
  labels,
  currency,
  height = 30,
  className = "w-full h-[30px]",
}: {
  data: number[];
  color: string;
  labels?: string[];
  height?: number | `${number}%`;
  className?: string;
  currency?: string;
}) {
  return (
    <Chart kind="sparkline" values={data} labels={labels} color={color} currency={currency} height={typeof height === "number" ? height : "fill"} className={className} />
  );
}
