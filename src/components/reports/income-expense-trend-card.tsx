"use client";

/**
 * The /reports "Income vs Expenses" trend card (extracted from reports/page.tsx so the Family
 * overview renders the identical card). Markup, colors and axes are unchanged.
 */
import { ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import { formatCompactNumber } from "@/lib/utils/number";
import { Chart } from "@/components/chart";
import { CHART_COLORS } from "@/lib/chart-colors";

export interface IncomeExpensePoint {
  label: string;
  income: number;
  expenses: number;
}

export interface IncomeExpenseTrendCardProps {
  timeseries: IncomeExpensePoint[];
  currency: string;
  description: string;
  /** Daily granularity: thinned, angled x-axis labels (reports "daily" period). */
  daily?: boolean;
  title?: string;
}

export function IncomeExpenseTrendCard({
  timeseries,
  currency,
  description,
  daily = false,
  title = "Income vs Expenses",
}: IncomeExpenseTrendCardProps) {
  return (
    <Card title={title} icon={ArrowLeftRight} tone="emerald" info={description} infoLabel="About this chart">
      <Chart
        kind="area"
        data={timeseries}
        xKey="label"
        height={288}
        currency={currency}
        series={[
          { key: "income", name: "Income", color: CHART_COLORS.positive },
          { key: "expenses", name: "Expenses", color: CHART_COLORS.negative },
        ]}
        grid
        legend
        xInterval={daily ? Math.max(0, Math.floor(timeseries.length / 12)) : 0}
        xAngle={daily ? -45 : undefined}
        yWidth={90}
      />
    </Card>
  );
}
