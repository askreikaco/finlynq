"use client";

/**
 * The /reports "Income vs Expenses" trend card (extracted from reports/page.tsx so the Family
 * overview renders the identical card). Markup, colors and axes are unchanged.
 */
import { ArrowLeftRight, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle icon={ArrowLeftRight} tone="emerald" info={description} infoLabel="About this chart">{title}</CardTitle>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
