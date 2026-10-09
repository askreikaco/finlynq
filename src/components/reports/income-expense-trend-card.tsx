"use client";

/**
 * The /reports "Income vs Expenses" trend card (extracted from reports/page.tsx so the Family
 * overview renders the identical card). Markup, colors and axes are unchanged.
 */
import { BarChart3 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import { formatCompactNumber } from "@/lib/utils/number";
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
  /** Prefix for the SVG gradient ids; set it when several cards share a page. */
  idPrefix?: string;
  title?: string;
}

export function IncomeExpenseTrendCard({
  timeseries,
  currency,
  description,
  daily = false,
  idPrefix = "",
  title = "Income vs Expenses",
}: IncomeExpenseTrendCardProps) {
  const incomeGrad = `${idPrefix}incomeGrad`;
  const expenseGrad = `${idPrefix}expenseGrad`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeseries} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id={incomeGrad} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.positive} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.positive} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={expenseGrad} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.negative} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.negative} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
                interval={daily ? Math.max(0, Math.floor(timeseries.length / 12)) : 0}
                angle={daily ? -45 : 0}
                textAnchor={daily ? "end" : "middle"}
                height={daily ? 60 : 30}
              />
              <YAxis
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCompactNumber(Number(v))}
                width={90}
              />
              <Tooltip
                formatter={(v) => formatCurrency(Number(v), currency)}
                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Area
                type="monotone"
                dataKey="income"
                name="Income"
                stroke={CHART_COLORS.positive}
                fill={`url(#${incomeGrad})`}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                name="Expenses"
                stroke={CHART_COLORS.negative}
                fill={`url(#${expenseGrad})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
