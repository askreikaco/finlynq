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

/** A metric whose value is already formatted text (e.g. "Age 65", "23 years"). */
export interface MetricTextItem {
  label: string;
  text: string;
  sub?: string;
}

const COLUMNS = {
  2: "grid grid-cols-2 gap-3",
  3: "grid grid-cols-2 wide:grid-cols-3 gap-3",
} as const;

function metricValue(m: MetricItem) {
  if (m.currency) {
    return <Amount value={m.value} currency={m.currency} size="md" tone={m.tone ?? "none"} showSign={m.showSign} />;
  }
  return <span className="tabular-nums text-sm font-semibold">{m.value}</span>;
}

/**
 * Grid of compact stat tiles. 2 columns by default; `columns={3}` gives 2 columns on phones and
 * 3 from the wide breakpoint (the desktop column is 48rem, so three tiles fit on one row there).
 */
export function MetricGrid({ metrics, columns = 2 }: { metrics: Array<MetricItem | MetricTextItem>; columns?: 2 | 3 }) {
  return (
    <div data-slot="metric-grid" data-columns={columns} className={COLUMNS[columns]}>
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
