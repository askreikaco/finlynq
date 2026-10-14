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

export function CategoryRow({ label, dot, amount, prev, budget, trend, cur, isIncome, sparkLabels, count, badge, indent }: CategoryRowProps) {
  const delta = monthDelta(amount, prev);
  const progress = budgetProgress(amount, budget);
  // Up is bad for spending, good for income.
  const deltaTone = !delta || delta.diff === 0 ? "text-muted-foreground" : (delta.diff > 0) === isIncome ? "text-pos" : "text-destructive";
  const barTone = !progress ? "" : progress.ratio > 1 ? "bg-destructive" : progress.ratio >= 0.75 ? "bg-warning" : "bg-primary";
  const usedPct = progress ? Math.round(Number.isFinite(progress.ratio) ? progress.ratio * 100 : 999) : 0;
  // Narrow: line 1 = name | amount, line 2 = chart + mini budget bar | change. Wide (container >= 36rem): one line.
  return (
    <span data-slot="category-row" className="@container block w-full min-w-0 font-sans">
      <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7.5rem_6.5rem]">
        <span className={`flex min-w-0 items-center gap-2.5${indent ? " pl-5" : ""}`}>
          <span data-slot="category-dot" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
          <span data-slot="category-label" className="truncate text-sm font-medium">{label}</span>
          {count != null && (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
              {count}
            </span>
          )}
          {badge}
        </span>
        <span data-slot="category-amount" className="text-right text-sm font-semibold tabular-nums @3xl:order-4">{formatCurrency(amount, cur)}</span>
        <span className="flex min-w-0 items-center gap-2 @3xl:order-2 @3xl:gap-3">
          <span data-slot="category-chart" className="block h-5 w-12 shrink-0 @3xl:w-16">
            {trend && trend.length > 1 ? (
              <Sparkline data={trend} color={dot} labels={sparkLabels} currency={cur} height="100%" className="h-full w-full" />
            ) : null}
          </span>
          <span data-slot="category-budget" className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span
              role="progressbar"
              aria-label="Budget used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress ? Math.min(100, usedPct) : 0}
              className="block h-1.5 w-[10cqw] min-w-10 max-w-24 @3xl:min-w-14 shrink-0 overflow-hidden rounded-full bg-muted"
            >
              {progress && <span className={`block h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }} />}
            </span>
            <span className={`whitespace-nowrap ${progress && progress.left < 0 ? "text-destructive" : ""}`}>
              {progress ? `${progress.left < 0 ? "Over" : "Left"} ${formatCurrency(Math.abs(progress.left), cur)}` : "No budget"}
            </span>
          </span>
        </span>
        <span data-slot="category-delta" title="vs last month" className={`whitespace-nowrap text-right text-xs font-medium @3xl:order-3 ${deltaTone}`}>
          {delta ? (
            <>
              {signed(delta.diff, cur)}
              {delta.pct != null && ` (${delta.pct >= 0 ? "+" : ""}${Math.round(delta.pct * 100)}%)`}
            </>
          ) : null}
        </span>
      </span>
    </span>
  );
}
