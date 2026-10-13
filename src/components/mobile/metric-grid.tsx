import { StatTile } from "./stat-tile";
import { Amount, type AmountTone } from "./amount";

export interface MetricItem {
  label: string;
  value: number;
  /** Given → rendered as money (formatCurrency); omitted → plain integer count. */
  currency?: string;
  tone?: AmountTone;
  showSign?: boolean;
}

/**
 * The one metric/stat tile grid rule: 2 columns on mobile (max), 3 on tablet (max), 4 on desktop (default).
 * Every metric/stat-card grid uses this (or metricGridClass for a known item count).
 */
export const METRIC_GRID_CLASS = "grid grid-cols-2 regular:grid-cols-3 wide:grid-cols-4 gap-3";

/**
 * METRIC_GRID_CLASS, but never more columns than items (no empty cells): 1 item = 1 column, 2 items = 2 columns
 * at every size, 3 items = 2 then 3 columns. 4 or more items use METRIC_GRID_CLASS.
 */
export function metricGridClass(count: number, gap = "gap-3"): string {
  if (count <= 1) return `grid grid-cols-1 ${gap}`;
  if (count === 2) return `grid grid-cols-2 ${gap}`;
  if (count === 3) return `grid grid-cols-2 regular:grid-cols-3 ${gap}`;
  return `grid grid-cols-2 regular:grid-cols-3 wide:grid-cols-4 ${gap}`;
}

/** Compact stat tiles in the shared metric grid (see METRIC_GRID_CLASS). */
export function MetricGrid({ metrics }: { metrics: MetricItem[] }) {
  return (
    <div data-slot="metric-grid" className={metricGridClass(metrics.length)}>
      {metrics.map((m) => (
        <StatTile
          key={m.label}
          label={m.label}
          value={
            m.currency ? (
              <Amount value={m.value} currency={m.currency} size="md" tone={m.tone ?? "none"} showSign={m.showSign} />
            ) : (
              <span className="tabular-nums text-sm font-semibold">{m.value}</span>
            )
          }
        />
      ))}
    </div>
  );
}
