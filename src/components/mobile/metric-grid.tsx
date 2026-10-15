import { MetricCard, type MetricCardProps } from "@/components/metric-card";

/**
 * The one metric/stat tile grid rule: 2 columns on mobile (max), 3 on tablet (max), 4 on desktop (default).
 * Every metric/stat-card grid uses this (or metricGridClass for a known item count).
 */
export const METRIC_GRID_CLASS = "grid grid-cols-2 regular:grid-cols-3 wide:grid-cols-4 gap-3";

/** Odd card counts on mobile (2 columns): the first card spans the full row, then pairs (Net Worth first, then 2 + 2). */
const MOBILE_LEAD = "[&>*:first-child]:col-span-2 regular:[&>*:first-child]:col-span-1";

/**
 * METRIC_GRID_CLASS, but count-aware (no empty cells):
 * - 1 item = 1 column, 2 items = 2 columns at every size;
 * - 3 items = first card full-width then 2 on mobile, 3 columns from tablet;
 * - 6 items = 3 columns from tablet up (3 + 3, never 4 + 2);
 * - other counts use METRIC_GRID_CLASS (4 and 8 keep the owner default of 4 on desktop); an odd count >= 5
 *   leads with one full-width card on mobile.
 * `max` caps the desktop column count (default 4; 3 = at most 3 on desktop, 2 = always 2).
 */
export function metricGridClass(count: number, gap = "gap-3", max: 2 | 3 | 4 = 4): string {
  if (count <= 1) return `grid grid-cols-1 ${gap}`;
  if (count === 2 || max === 2) return `grid grid-cols-2 ${gap}`;
  if (count === 3 || max === 3) return `grid grid-cols-2 regular:grid-cols-3 ${gap}${count % 2 === 1 ? ` ${MOBILE_LEAD}` : ""}`;
  if (count === 6) return `grid grid-cols-2 regular:grid-cols-3 ${gap}`;
  return `grid grid-cols-2 regular:grid-cols-3 wide:grid-cols-4 ${gap}${count % 2 === 1 ? ` ${MOBILE_LEAD}` : ""}`;
}

/**
 * The layout wrapper for MetricCards (see METRIC_GRID_CLASS): one MetricCard per entry, all props as MetricCard's.
 * `columns` caps the desktop column count (default 4: 2 on mobile, 3 on tablet, 4 on desktop).
 */
export function MetricGrid({ metrics, columns = 4 }: { metrics: MetricCardProps[]; columns?: 2 | 3 | 4 }) {
  return (
    <div data-slot="metric-grid" data-columns={columns} className={metricGridClass(metrics.length, "gap-3", columns)}>
      {metrics.map((m, i) => (
        <MetricCard key={m.id ?? (typeof m.label === "string" ? m.label : i)} {...m} />
      ))}
    </div>
  );
}
