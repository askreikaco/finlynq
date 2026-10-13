import { StatTile } from "./stat-tile";
import { Amount, type AmountTone } from "./amount";

/** A numeric metric: money when `currency` is given, a plain count otherwise. */
export interface MetricItem {
  label: string;
  value: number;
  /** Given -> rendered as money (formatCurrency); omitted -> plain integer count. */
  currency?: string;
  tone?: AmountTone;
  showSign?: boolean;
  /** Optional one-line caption under the value. */
  sub?: string;
}

/**
 * The one metric/stat tile grid rule: 2 columns on mobile (max), 3 on tablet (max), 4 on desktop (default).
 * Every metric/stat-card grid uses this (or metricGridClass for a known item count).
 */
export const METRIC_GRID_CLASS = "grid grid-cols-2 regular:grid-cols-3 wide:grid-cols-4 gap-3";

/**
 * METRIC_GRID_CLASS, but never more columns than items (no empty cells): 1 item = 1 column, 2 items = 2 columns
 * at every size, 3 items = 2 then 3 columns. 4 or more items use METRIC_GRID_CLASS.
 * `max` caps the desktop column count (default 4; 3 = at most 3 on desktop, 2 = always 2).
 */
export function metricGridClass(count: number, gap = "gap-3", max: 2 | 3 | 4 = 4): string {
  if (count <= 1) return `grid grid-cols-1 ${gap}`;
  if (count === 2 || max === 2) return `grid grid-cols-2 ${gap}`;
  if (count === 3 || max === 3) return `grid grid-cols-2 regular:grid-cols-3 ${gap}`;
  return `grid grid-cols-2 regular:grid-cols-3 wide:grid-cols-4 ${gap}`;
}

/** A metric whose value is already formatted text (e.g. "Age 65", "23 years"). */
export interface MetricTextItem {
  label: string;
  text: string;
  sub?: string;
}

function metricValue(m: MetricItem) {
  if (m.currency) {
    return <Amount value={m.value} currency={m.currency} size="md" tone={m.tone ?? "none"} showSign={m.showSign} />;
  }
  return <span className="tabular-nums text-sm font-semibold">{m.value}</span>;
}

/**
 * Compact stat tiles in the shared metric grid (see METRIC_GRID_CLASS). `columns` caps the desktop column count
 * (default 4: 2 on mobile, 3 on tablet, 4 on desktop).
 */
export function MetricGrid({ metrics, columns = 4 }: { metrics: Array<MetricItem | MetricTextItem>; columns?: 2 | 3 | 4 }) {
  return (
    <div data-slot="metric-grid" data-columns={columns} className={metricGridClass(metrics.length, "gap-3", columns)}>
      {metrics.map((m) => (
        <StatTile
          key={m.label}
          label={m.label}
          sub={m.sub}
          value={
            "text" in m ? (
              <span className="tabular-nums text-sm font-semibold">{m.text}</span>
            ) : (
              metricValue(m)
            )
          }
        />
      ))}
    </div>
  );
}
