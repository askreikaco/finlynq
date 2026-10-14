"use client";

import { MetricCard } from "@/components/metric-card";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Wallet } from "lucide-react";
import { motion } from "framer-motion";
import type { MetricTrend } from "./key-metrics";

type Props = {
  income: number;
  expenses: number;
  currency?: string;
  /** Label of the month the figures cover (the dashboard's reference month,
   * usually the last complete month — not necessarily the current one). */
  monthLabel?: string;
  /** Badge / signed difference / sparkline of income minus expenses over the months (null / omitted = value only). */
  trend?: MetricTrend;
};

export function AvailableToSpend({ income, expenses, currency, monthLabel, trend }: Props) {
  const { displayCurrency: userDisplayCurrency } = useDisplayCurrency();
  const resolvedCurrency = currency?.trim() ? currency : userDisplayCurrency;
  const available = income - expenses;
  const pctSpent = income > 0 ? (expenses / income) * 100 : 0;

  return (
    <MetricCard
      label="Available to Spend"
      icon={Wallet}
      tone="cyan"
      value={Math.abs(available)}
      currency={resolvedCurrency}
      valueClassName={available >= 0 ? "text-pos" : "text-destructive"}
      sub={trend?.delta ?? (monthLabel ? `${monthLabel} remaining` : "This month remaining")}
      note={trend?.delta ? (monthLabel ? `${monthLabel} remaining` : "This month remaining") : undefined}
      badgePct={trend?.badgePct}
      invertTone={false}
      sparkData={trend?.sparkData}
      sparkLabels={trend?.sparkLabels}
      sparkColor="#06b6d4"
    >
      {income > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Income</span>
            <span className="font-semibold text-pos tabular-nums">
              {formatCurrency(income, resolvedCurrency)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Spent so far</span>
            <span className="font-semibold text-destructive tabular-nums">
              -{formatCurrency(expenses, resolvedCurrency)}
            </span>
          </div>
          <div className="border-t pt-2 flex justify-between text-xs font-semibold">
            <span>Remaining</span>
            <span className={`tabular-nums ${available >= 0 ? "text-pos" : "text-destructive"}`}>
              {formatCurrency(available, resolvedCurrency)}
            </span>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden mt-3">
            <motion.div
              className={`h-full rounded-full ${pctSpent > 100 ? "bg-destructive" : pctSpent > 80 ? "bg-warning" : "bg-pos"}`}
              initial={false}
              animate={{ width: `${Math.min(100, pctSpent)}%` }}
              transition={{ duration: 0 }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1.5 tabular-nums">
            {Math.round(pctSpent)}% of income spent
          </p>
        </div>
      )}
    </MetricCard>
  );
}

