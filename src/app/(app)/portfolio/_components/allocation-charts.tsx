"use client";

/**
 * Allocation Overview sub-surface (FINLYNQ-118 Phase 3).
 *
 * The "By Asset Type" + "By Account" pie/legend grid. Extracted verbatim from
 * portfolio/page.tsx — the allocation arrays are computed on the page (from
 * `byType` / `byAccount` + `summary`) and passed in, so this component stays
 * purely presentational.
 */

import { Chart } from "@/components/chart";
import { Landmark, PieChart as PieChartIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PIE_COLORS } from "../_types";

type AllocationByTypeRow = { name: string; value: number; pct: number; color: string };
type AllocationByAccountRow = { name: string; value: number; pct: number };

export function AllocationCharts({
  allocationByType,
  allocationByAccount,
  displayCurrency,
}: {
  allocationByType: AllocationByTypeRow[];
  allocationByAccount: AllocationByAccountRow[];
  displayCurrency: string;
}) {
  return (
    <div className="grid grid-cols-1 regular:grid-cols-2 gap-4">
      {/* By Asset Type */}
      <Card title="By Asset Type" icon={PieChartIcon} tone="amber">
        <Chart kind="donut" data={allocationByType} currency={displayCurrency} size="sm" breakdownList breakdownValue="both" />
      </Card>

      {/* By Account */}
      <Card title="By Account" icon={Landmark} tone="indigo">
        <Chart kind="donut" data={allocationByAccount.map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] }))} currency={displayCurrency} size="sm" breakdownList breakdownValue="both" breakdownScroll />
      </Card>
    </div>
  );
}
