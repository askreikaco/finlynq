"use client";

/**
 * CategoryRow: the ONE row of the Categories list, used by a category group header AND by each category.
 * Colour dot, label, amount, change vs last month (value and %), mini chart and the budget progress bar
 * (remaining budget). A group passes the rollup of its children, so both look and read the same.
 *
 * A thin mapping of category data to ListRow props; `embedded` renders it inside an accordion trigger.
 */

import type { ReactNode } from "react";
import { ListRow, type ListRowProps } from "@/components/mobile/list-row";
import { formatCurrency } from "@/lib/currency";

export interface CategoryRowProps {
  label: string;
  /** Colour dot (and chart tint for the share). */
  dot: string;
  /** Selected month, display currency. */
  amount: number;
  /** Previous month's amount; null = not known. */
  prev: number | null;
  /** Budget for the month; null = none. */
  budget: number | null;
  /** Monthly series, oldest first. */
  trend: number[] | null;
  cur: string;
  /** Income: up is good. Spending: up is bad. */
  isIncome: boolean;
  sparkLabels: string[];
  /** Number of categories in a group. */
  count?: number;
  /** Trailing badge (e.g. sync state). */
  badge?: ReactNode;
  /** Indent the name only (a category inside a group); the value columns stay aligned with the group row. */
  indent?: boolean;
  /** Interaction (link / button / selected / embedded in an accordion trigger), straight to ListRow. */
  row?: Partial<Pick<ListRowProps, "href" | "onPress" | "selected" | "embedded" | "className" | "aria-label" | "data-edit-row" | "chevron">>;
}

/** Change vs last month: signed value and % (null % when last month was 0 or unknown). */
export function monthDelta(amount: number, prev: number | null): { diff: number; pct: number | null } | null {
  if (prev == null) return null;
  const diff = amount - prev;
  return { diff, pct: prev !== 0 ? diff / Math.abs(prev) : null };
}

/** Budget progress: used fraction (uncapped) and the remaining amount (negative = over). */
export function budgetProgress(amount: number, budget: number | null): { ratio: number; left: number } | null {
  if (budget == null) return null;
  return { ratio: budget > 0 ? amount / budget : amount > 0 ? Infinity : 0, left: budget - amount };
}

function signed(n: number, cur: string): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${formatCurrency(Math.abs(n), cur)}`;
}

export function CategoryRow({ label, dot, amount, prev, budget, trend, cur, isIncome, sparkLabels, count, badge, indent, row }: CategoryRowProps) {
  const delta = monthDelta(amount, prev);
  const progress = budgetProgress(amount, budget);
  // Up is bad for spending, good for income.
  const deltaTone = !delta || delta.diff === 0 ? "text-muted-foreground" : (delta.diff > 0) === isIncome ? "text-pos" : "text-destructive";
  const barTone = !progress ? undefined : progress.ratio > 1 ? "destructive" : progress.ratio >= 0.75 ? "warning" : "primary";
  const usedPct = progress ? Math.round(Number.isFinite(progress.ratio) ? progress.ratio * 100 : 999) : null;
  return (
    <ListRow
      {...row}
      slot="category"
      title={label}
      dot={dot}
      value={formatCurrency(amount, cur)}
      trend={trend}
      trendLabels={sparkLabels}
      currency={cur}
      progress={{
        pct: usedPct,
        tone: barTone,
        label: progress ? `${progress.left < 0 ? "Over" : "Left"} ${formatCurrency(Math.abs(progress.left), cur)}` : "No budget",
        labelClassName: progress && progress.left < 0 ? "text-destructive" : "",
        aria: "Budget used",
      }}
      delta={
        delta ? (
          <>
            {signed(delta.diff, cur)}
            {delta.pct != null && ` (${delta.pct >= 0 ? "+" : ""}${Math.round(delta.pct * 100)}%)`}
          </>
        ) : null
      }
      deltaTone={deltaTone}
      deltaTitle="vs last month"
      count={count}
      badge={badge}
      indent={indent}
    />
  );
}
