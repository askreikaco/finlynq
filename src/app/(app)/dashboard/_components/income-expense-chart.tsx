"use client";

import { ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionCard } from "@/components/mobile/section-card";
import { Chart } from "@/components/chart";
import { CHART_COLORS } from "@/lib/chart-colors";
import { Button } from "@/components/ui/button";
import { useDisplayCurrency } from "@/components/currency-provider";
import { buildStackedSeries, type StackPoint } from "@/lib/chart-stack";
import { motion } from "framer-motion";
import type { MonthlyData } from "./types";
import { useAnimations } from "@/hooks/use-animations";

const itemVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

const noAnimationVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/**
 * One stacked-by-category sub-chart (income OR expense). FINLYNQ-129 — the "By
 * category" toggle splits the dual-line chart into two of these, stacked
 * vertically in place of the original. Each band's per-month value comes from
 * the FINLYNQ-128 per-(month,type) category breakdown; the outer edge ties to
 * the original income/expense line at every month (residual = total − top10).
 */
function StackedSideChart({
  title,
  data,
  valueKey,
  breakdownKey,
  currency,
}: {
  title: string;
  data: MonthlyData[];
  valueKey: "income" | "expenses";
  breakdownKey: "incomeBreakdown" | "expenseBreakdown";
  currency: string;
}) {
  const { rows, legend } = useMemo(
    () =>
      buildStackedSeries(
        data.map(
          (m): StackPoint => ({
            date: m.month,
            total: m[valueKey],
            // Breakdown rows are { name, value } — keyed by name (categories are
            // named consistently across months, so the band stays stable).
            members: (m[breakdownKey] ?? []).map((b) => ({ name: b.name, value: b.value })),
          }),
        ),
        { maxMembers: 10 },
      ),
    [data, valueKey, breakdownKey],
  );

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
      <Chart kind="stacked-area" data={rows} series={legend} height={170} currency={currency} legend />
    </div>
  );
}

export function IncomeExpenseChart({
  data,
  currency,
}: {
  data: MonthlyData[];
  currency?: string;
}) {
  const { displayCurrency: userDisplayCurrency } = useDisplayCurrency();
  const resolvedCurrency = currency?.trim() ? currency : userDisplayCurrency;
  // FINLYNQ-129 — component-only "By category" toggle (resets on reload).
  const [stacked, setStacked] = useState(false);
  // Only offer stacking when at least one month carries a category breakdown.
  const stackable = useMemo(
    () => data.some((m) => (m.incomeBreakdown?.length ?? 0) > 0 || (m.expenseBreakdown?.length ?? 0) > 0),
    [data],
  );
  const showStacked = stacked && stackable;
  const animationsEnabled = useAnimations();

  return (
    <motion.div variants={animationsEnabled ? itemVariants : noAnimationVariants}>
      <SectionCard label="Income vs Expenses" icon={ArrowLeftRight} tone="emerald" cardClassName="card-hover">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-muted-foreground">Last 12 months</p>
          {stackable && (
            <Button
              size="sm"
              variant={stacked ? "primary" : "outline"}
              onClick={() => setStacked((s) => !s)}
              title="Split into stacked top-10 category views"
            >
              By category
            </Button>
          )}
        </div>
        <div>
          {showStacked ? (
            <div className="space-y-4">
              <StackedSideChart
                title="Income by category"
                data={data}
                valueKey="income"
                breakdownKey="incomeBreakdown"
                currency={resolvedCurrency}
              />
              <StackedSideChart
                title="Expenses by category"
                data={data}
                valueKey="expenses"
                breakdownKey="expenseBreakdown"
                currency={resolvedCurrency}
              />
            </div>
          ) : (
            <>
              <Chart
                kind="area"
                data={data}
                xKey="month"
                height={260}
                currency={resolvedCurrency}
                series={[
                  { key: "income", name: "Income", color: CHART_COLORS.positive, breakdownKey: "incomeBreakdown" },
                  { key: "expenses", name: "Expenses", color: CHART_COLORS.negative, breakdownKey: "expenseBreakdown" },
                ]}
                legend
              />
            </>
          )}
        </div>
      </SectionCard>
    </motion.div>
  );
}
