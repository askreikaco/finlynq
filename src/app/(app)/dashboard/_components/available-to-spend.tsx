"use client";

import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Wallet } from "lucide-react";
import type { MetricTrend } from "./key-metrics";
import { Card } from "@/components/ui/card";

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
    <Card
      title="Available to Spend"
      icon={Wallet}
      tone="cyan"
      value={Math.abs(available)}
      currency={resolvedCurrency}
      valueClassName={available >= 0 ? "text-pos" : "text-destructive"}
      sub={trend?.delta ?? (monthLabel ? `${monthLabel} remaining` : "This month remaining")}
      note={trend?.delta ? (monthLabel ? `${monthLabel} remaining` : "This month remaining") : undefined}
      delta={{ pct: trend?.badgePct }}
      spark={{ data: trend?.sparkData, color: "#06b6d4", labels: trend?.sparkLabels }}
      progress={income > 0 ? { value: pctSpent, tone: pctSpent > 100 ? "destructive" : pctSpent > 80 ? "warning" : "pos", caption: `${Math.round(pctSpent)}% of income spent`, ariaLabel: "Income spent" } : undefined}
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
        </div>
      )}
    </Card>
  );
}

