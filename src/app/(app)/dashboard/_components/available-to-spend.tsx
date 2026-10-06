"use client";

import { MetricCard } from "@/components/metric-card";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Wallet } from "lucide-react";
import { motion } from "framer-motion";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

type Props = {
  income: number;
  expenses: number;
  currency?: string;
  /** Label of the month the figures cover (the dashboard's reference month,
   * usually the last complete month — not necessarily the current one). */
  monthLabel?: string;
};

export function AvailableToSpend({ income, expenses, currency, monthLabel }: Props) {
  const displayCurrency = currency || useDisplayCurrency().displayCurrency;
  const available = income - expenses;
  const pctSpent = income > 0 ? (expenses / income) * 100 : 0;

  return (
    <MetricCard
      label="Available to Spend"
      icon={Wallet}
      tone="cyan"
      value={Math.abs(available)}
      currency={displayCurrency}
      valueClassName={available >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}
      sub={monthLabel ? `${monthLabel} remaining` : "This month remaining"}
    >
      {income > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-[12px]">
            <span className="text-muted-foreground">Income</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(income, displayCurrency)}
            </span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-muted-foreground">Spent so far</span>
            <span className="font-semibold text-rose-500 tabular-nums">
              -{formatCurrency(expenses, displayCurrency)}
            </span>
          </div>
          <div className="border-t pt-2 flex justify-between text-[12px] font-semibold">
            <span>Remaining</span>
            <span className={`tabular-nums ${available >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
              {formatCurrency(available, displayCurrency)}
            </span>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden mt-3">
            <motion.div
              className={`h-full rounded-full ${pctSpent > 100 ? "bg-rose-500" : pctSpent > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, pctSpent)}%` }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5 tabular-nums">
            {Math.round(pctSpent)}% of income spent
          </p>
        </div>
      )}
    </MetricCard>
  );
}

