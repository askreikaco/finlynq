"use client";

/**
 * CategoryRow: the ONE row of the Categories list, used by a category group header AND by each category.
 * Colour dot, label, amount, change vs last month (value and %), mini chart and the budget progress bar
 * (remaining budget). A group passes the rollup of its children, so both look and read the same.
 *
 * Only inline elements (spans), so it can sit inside an accordion trigger (button) or a link.
 */

import type { ReactNode } from "react";
import { Sparkline } from "@/components/sparkline";
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
  /** Share of the month total (0..1). */
  share: number;
  cur: string;
  /** Income: up is good. Spending: up is bad. */
  isIncome: boolean;
  sparkLabels: string[];
  /** Number of categories in a group. */
  count?: number;
  /** Trailing badge (e.g. sync state). */
  badge?: ReactNode;
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

export function CategoryRow({ label, dot, amount, prev, budget, trend, share, cur, isIncome, sparkLabels, count, badge }: CategoryRowProps) {
  const delta = monthDelta(amount, prev);
  const progress = budgetProgress(amount, budget);
  // Up is bad for spending, good for income.
  const deltaTone = !delta || delta.diff === 0 ? "text-muted-foreground" : (delta.diff > 0) === isIncome ? "text-pos" : "text-destructive";
  const barTone = !progress ? "" : progress.ratio > 1 ? "bg-destructive" : progress.ratio >= 0.75 ? "bg-warning" : "bg-primary";
  const usedPct = progress ? Math.round(Number.isFinite(progress.ratio) ? progress.ratio * 100 : 999) : 0;
  return (
    <span data-slot="category-row" className="block w-full min-w-0 space-y-2">
      <span className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span data-slot="category-dot" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span data-slot="category-label" className="truncate text-sm font-medium">{label}</span>
              {count != null && (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                  {count}
                </span>
              )}
              {badge}
            </span>
            <span className="block text-xs text-muted-foreground tabular-nums">{Math.round(share * 100)}%</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span data-slot="category-amount" className="block text-sm font-semibold tabular-nums">{formatCurrency(amount, cur)}</span>
          {delta && (
            <span data-slot="category-delta" title="vs last month" className={`block text-xs font-medium tabular-nums ${deltaTone}`}>
              {signed(delta.diff, cur)}
              {delta.pct != null && ` (${delta.pct >= 0 ? "+" : ""}${Math.round(delta.pct * 100)}%)`}
            </span>
          )}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <span data-slot="category-chart" className="block h-6 w-20 shrink-0">
          {trend && trend.length > 1 ? (
            <Sparkline data={trend} color={dot} labels={sparkLabels} currency={cur} height="100%" className="h-full w-full" />
          ) : null}
        </span>
        <span data-slot="category-budget" className="block min-w-0 flex-1">
          <span
            role="progressbar"
            aria-label="Budget used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ? Math.min(100, usedPct) : 0}
            className="block h-1.5 overflow-hidden rounded-full bg-muted"
          >
            {progress && <span className={`block h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }} />}
          </span>
          <span className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
            {progress ? (
              <>
                <span>{usedPct}%</span>
                <span className={progress.left < 0 ? "text-destructive" : undefined}>
                  {progress.left < 0 ? "Over" : "Left"} {formatCurrency(Math.abs(progress.left), cur)}
                </span>
              </>
            ) : (
              <span>No budget</span>
            )}
          </span>
        </span>
      </span>
    </span>
  );
}
