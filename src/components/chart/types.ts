import type { ReactNode } from "react";

/** Every drawing the app needs; the optional parts below are shown or hidden per call site. */
export type ChartKind =
  | "sparkline"
  | "line"
  | "area"
  | "bar"
  | "stacked-bar"
  | "stacked-area"
  | "donut"
  | "sankey"
  | "progress";

/** Theme tone names (the progress colours of the app). */
export type ChartTone = "primary" | "pos" | "warning" | "destructive" | "neutral";

export type ChartSize = "xs" | "sm" | "md" | "lg";

/** One drawn series. Structurally compatible with `StackLegendEntry` (lib/chart-stack.ts), so `series={legend}` works. */
export interface ChartSeries {
  /** Data key on each row. */
  key: string;
  /** Legend / tooltip name. */
  name?: string;
  /** Any CSS colour. Default: the shared palette (lib/chart-colors.ts) by series index. */
  color?: string;
  /** Draw this series differently from the chart `kind` (e.g. a budget line over bars). */
  as?: "line" | "area" | "bar";
  stackId?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  /** Area: fade the fill to transparent (default on for a non-stacked area). */
  gradient?: boolean;
  dashed?: boolean;
  /** Draw a dot on every point (a single-point series would otherwise be invisible). */
  dots?: boolean;
  /** Step line (budgets). */
  step?: boolean;
  connectNulls?: boolean;
  /** Row field holding a `BreakdownRow[]`, listed under this series' value in the tooltip. */
  breakdownKey?: string;
  /** Bar: one palette colour per row. */
  colorByRow?: boolean;
  /** Bar: per-row colour / opacity override. */
  barStyle?: (row: never, index: number) => { color?: string; opacity?: number } | undefined;
}

export interface ChartLine {
  y?: number;
  x?: string | number;
  label?: string;
  color?: string;
  dashed?: boolean;
  width?: number;
}

export interface ChartFlowItem {
  name: string;
  value: number;
}

export interface ChartProps {
  kind: ChartKind;

  // ── data ──
  data?: ReadonlyArray<object>;
  series?: ChartSeries[];
  /** Row field for the x axis (donut: the name field). Default "date". */
  xKey?: string;
  /** Sparkline only: plain values, plus optional "YYYY-MM" labels that make it interactive. */
  values?: number[];
  labels?: string[];

  // ── optional parts (all hide-able) ──
  legend?: boolean;
  tooltip?: boolean;
  axes?: boolean | { x?: boolean; y?: boolean };
  grid?: boolean;
  /** Donut: the ranked list next to the ring. */
  breakdownList?: boolean;
  /** Donut breakdown: a thin share bar under each row. */
  breakdownBars?: boolean;
  /** Donut breakdown: what the right-hand column shows ("inline" = one label, "Name 40%"). Default "pct". */
  breakdownValue?: "pct" | "value" | "both" | "inline";
  breakdownLimit?: number;
  breakdownScroll?: boolean;
  /** Reference lines (target, budget, average, FIRE number, ...). */
  lines?: ChartLine[];
  /** Draw the zero line (the value series crosses zero). */
  zeroLine?: boolean;
  /** Change first -> last of the first series, shown as a chip. A number is a given percent. */
  delta?: boolean | number;

  // ── tooltip ──
  tooltipTotal?: boolean;
  tooltipWide?: boolean;
  breakdownHeading?: string;
  /** Replace the tooltip body (receives the hovered data row). */
  renderTooltip?: (row: never) => ReactNode;

  // ── formatting ──
  currency?: string;
  formatValue?: (value: number) => string;
  formatX?: (value: string) => string;
  formatY?: (value: number) => string;
  formatLabel?: (label: string) => string;
  yDomain?: [number, number] | ["auto", "auto"];
  xInterval?: number | "preserveStartEnd";
  xAngle?: number;
  yWidth?: number;

  // ── size ──
  /** Pixels, or "fill" to take the height of a sized parent. Donut: ring diameter. */
  height?: number | "fill";
  size?: ChartSize;
  className?: string;
  ariaLabel?: string;
  /** Horizontal bars (category axis on the left). */
  horizontal?: boolean;

  // ── colour ──
  color?: string;
  tone?: ChartTone;
  /** Goal / loan status (lib/status-colour.ts) -> colour. */
  status?: "active" | "completed" | "overdue" | "paused";

  // ── donut ──
  valueKey?: string;
  /** "total" = the caption + sum in the hole; a node = anything else. */
  center?: "total" | ReactNode;
  /** Content above the breakdown list. */
  heading?: ReactNode;
  onSliceClick?: (row: { key: string; name: string; value: number }, index: number) => void;

  // ── sankey ──
  sankey?: { income: ChartFlowItem[]; expenses: ChartFlowItem[]; savings?: boolean };

  // ── progress ──
  /** Percent 0-100 (clamped). */
  value?: number;
  trackTone?: ChartTone;
  label?: ReactNode;
  valueLabel?: boolean;
  /** Marker position 0-100 (a target on the bar). */
  target?: number;
  testId?: string;
}
