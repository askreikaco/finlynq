"use client";

/**
 * ProgressRow: the ONE row of the Categories, Goals and Loans lists.
 * [colour dot | name (+ meta) | mini chart | progress bar + label | change | value], right-aligned value column.
 * Narrow: line 1 = name | value, line 2 = chart + mini bar + label | change. Wide (container >= 48rem): one line.
 *
 * Only inline elements (spans), so it can sit inside an accordion trigger (button) or a link. The data-slot names
 * share a prefix (`slot`) so each list keeps its own test hooks.
 */

import type { ReactNode } from "react";
import { Sparkline } from "@/components/sparkline";
import { cn } from "@/lib/utils";

/** Classes of the tappable wrapper (link or button) around a ProgressRow. */
export const PROGRESS_ROW_LINK =
  "block min-w-0 w-full py-3 pl-4 pr-11 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** Same, for lists without a trailing chevron (goals, loans). */
export const PROGRESS_ROW_PRESS =
  "block min-w-0 w-full py-3 px-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type ProgressTone = "primary" | "warning" | "destructive" | "pos";
const BAR_TONE: Record<ProgressTone, string> = {
  primary: "bg-primary",
  warning: "bg-warning",
  destructive: "bg-destructive",
  pos: "bg-pos",
};

/** The ONE thin progress bar (ProgressRow's mini bar, MetricCard's progress part). `value` 0..100, clamped; null = empty track. */
export function ProgressBar({ value, tone = "primary", ariaLabel, className }: { value: number | null; tone?: ProgressTone; ariaLabel: string; className?: string }) {
  const fill = value == null ? null : Math.min(100, Math.max(0, value));
  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fill ?? 0}
      className={cn("block h-1.5 shrink-0 overflow-hidden rounded-full bg-muted", className)}
    >
      {fill != null && <span className={cn("block h-full rounded-full", BAR_TONE[tone])} style={{ width: `${fill}%` }} />}
    </span>
  );
}

export interface ProgressRowProps {
  label: string;
  /** Colour dot (and chart tint). */
  dot: string;
  /** Chart tint when the dot is a CSS variable (SVG gradient stops cannot resolve var()); defaults to `dot`. */
  chartColor?: string;
  /** Right-aligned value, already formatted. */
  value: ReactNode;
  /** Small muted line under the name (deadline, rate). */
  meta?: ReactNode;
  /** Right-aligned change / secondary text under the value (narrow) or between bar and value (wide). */
  delta?: ReactNode;
  deltaTone?: string;
  deltaTitle?: string;
  /** Series, oldest first; null / short = no chart (the slot stays so columns line up). */
  trend: number[] | null;
  sparkLabels?: string[];
  cur: string;
  /** Progress bar fill 0..100 (uncapped values are clamped); null = bar without fill. */
  pct: number | null;
  barTone?: ProgressTone;
  /** Text next to the bar ("Left $5", "40%", "No budget"). */
  progressLabel: ReactNode;
  progressLabelClassName?: string;
  progressAria: string;
  /** Number of items in a group. */
  count?: number;
  /** Trailing badge (e.g. sync state). */
  badge?: ReactNode;
  /** Indent the name only; value columns stay aligned. */
  indent?: boolean;
  strike?: boolean;
  /** data-slot prefix ("category" -> category-row, category-dot, ...). */
  slot?: string;
}

export function ProgressRow({
  label, dot, chartColor, value, meta, delta, deltaTone = "text-muted-foreground", deltaTitle, trend, sparkLabels, cur, pct, barTone = "primary",
  progressLabel, progressLabelClassName, progressAria, count, badge, indent, strike, slot = "progress",
}: ProgressRowProps) {
  return (
    <span data-slot={`${slot}-row`} className="@container block w-full min-w-0 font-sans">
      <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7.5rem_6.5rem]">
        <span className={cn("flex min-w-0 items-center gap-2.5", indent && "pl-5")}>
          <span data-slot={`${slot}-dot`} className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span data-slot={`${slot}-label`} className={cn("truncate text-sm font-medium", strike && "text-muted-foreground line-through")}>{label}</span>
            {meta ? <span data-slot={`${slot}-meta`} className="truncate text-xs text-muted-foreground">{meta}</span> : null}
          </span>
          {count != null && (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
              {count}
            </span>
          )}
          {badge}
        </span>
        <span data-slot={`${slot}-amount`} className="text-right text-sm font-semibold tabular-nums @3xl:order-4">{value}</span>
        <span className="flex min-w-0 items-center gap-2 @3xl:order-2 @3xl:gap-3">
          <span data-slot={`${slot}-chart`} className="block h-5 w-12 shrink-0 @max-[22rem]:hidden @3xl:w-16">
            {trend && trend.length > 1 ? (
              <Sparkline data={trend} color={chartColor ?? dot} labels={sparkLabels} currency={cur} height="100%" className="h-full w-full" />
            ) : null}
          </span>
          <span data-slot={`${slot}-budget`} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <ProgressBar value={pct} tone={barTone} ariaLabel={progressAria} className="w-[10cqw] min-w-10 max-w-24 @3xl:min-w-14" />
            <span className={cn("whitespace-nowrap", progressLabelClassName)}>{progressLabel}</span>
          </span>
        </span>
        <span data-slot={`${slot}-delta`} title={deltaTitle} className={cn("whitespace-nowrap text-right text-xs font-medium @3xl:order-3", deltaTone)}>
          {delta}
        </span>
      </span>
    </span>
  );
}

/** Tappable wrapper of a ProgressRow (opens the detail pane / sheet); selection style = ListRow's (`bg-muted`). */
export function ProgressRowButton({ onPress, selected, children, ariaLabel }: { onPress: () => void; selected?: boolean; children: ReactNode; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel}
      className={cn(PROGRESS_ROW_PRESS, selected && "bg-muted")}
      {...(selected ? { "data-selected": "true", "aria-current": "true" as const } : {})}
    >
      {children}
    </button>
  );
}
