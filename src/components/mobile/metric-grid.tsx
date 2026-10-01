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

/** 2-column grid of compact stat tiles. */
export function MetricGrid({ metrics }: { metrics: MetricItem[] }) {
  return (
    <div data-slot="metric-grid" className="grid grid-cols-2 gap-3">
      {metrics.map((m) => (
        <StatTile
          key={m.label}
          label={m.label}
          value={
            m.currency ? (
              <Amount value={m.value} currency={m.currency} size="md" tone={m.tone ?? "none"} showSign={m.showSign} />
            ) : (
              <span className="tabular-nums text-[15px] font-semibold">{m.value}</span>
            )
          }
        />
      ))}
    </div>
  );
}
