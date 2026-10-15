"use client";

/**
 * Chart: the ONE chart component of the app (owner: "as few global components as possible: multiple fields for every
 * use case, show/hide per case"). `kind` picks the drawing; the optional parts (legend, tooltip, axes, grid,
 * breakdownList, lines, zeroLine, delta, centre total, ...) are shown or hidden per call site.
 *
 *   sparkline      values (+ labels = hover tooltip)           MetricCard footer, list-row trend
 *   line | area    data + series, optional axes/grid/legend     net worth, performance, trends, projections
 *   bar            data + series (or horizontal)                reports, category history, weekly recap
 *   stacked-bar | stacked-area   series = StackLegendEntry[]    by-account / by-category stacks
 *   donut          data rows {name, value, color?} (+ list)     spending, allocation, ETF regions
 *   sankey         sankey = {income, expenses}                  reports cash flow
 *   progress       value 0-100 (+ tone/status, label, target)   loans, goals, budgets, tax room
 *
 * Container-aware: it measures its own box (ResizeObserver) and uses container queries (`@container`), so the same
 * markup fits the 25%-wide pane and a phone. Colours are the shared palette (lib/chart-colors.ts), the theme tones
 * and the status colours (lib/status-colour.ts). Never animates on mount; hover effects stay. CSP-safe: no inline
 * style attribute reaches the HTML (see shared.tsx / progress.tsx).
 */

import type { ChartProps } from "./types";
import { CartesianView } from "./cartesian";
import { DonutView } from "./donut";
import { ProgressView } from "./progress";
import { SankeyView } from "./sankey";

export function Chart(props: ChartProps) {
  switch (props.kind) {
    case "progress":
      return <ProgressView {...props} />;
    case "donut":
      return <DonutView {...props} />;
    case "sankey":
      return <SankeyView {...props} />;
    default:
      return <CartesianView {...props} />;
  }
}

export { sparkDomain } from "./cartesian";
export type { ChartProps, ChartSeries, ChartKind, ChartLine, ChartTone, ChartSize, ChartFlowItem } from "./types";
