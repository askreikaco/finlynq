import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MetricCard, type MetricTone } from "@/components/metric-card";
import { metricGridClass } from "./metric-grid";

/** One summary metric rendered as the shared MetricCard (value, % vs previous period, monthly sparkline). */
export interface ChartMetric {
  /** Stable key + test id suffix (data-testid="metric-<id>"). */
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: MetricTone;
  /** number = animated currency amount; anything else renders as-is (counts, "3 / 5"). */
  value: number | ReactNode;
  currency?: string;
  valueClassName?: string;
  /** Signed difference line ("+$1,234 vs last month"); see formatDelta. */
  sub?: ReactNode;
  /** Second small line (currency caveat, covered month). */
  note?: ReactNode;
  /** % change vs the previous period; null/undefined = no badge (previous period not derivable). */
  badgePct?: number | null;
  /** Less is better (debt, spent): up = red, down = green. */
  invertTone?: boolean;
  /** Monthly series; the sparkline only renders with >= 2 real points. */
  sparkData?: number[];
  sparkLabels?: string[];
  sparkColor?: string;
  href?: string;
  ariaLabel?: string;
}

/**
 * The summary grid of MetricCards for /loans, /goals and /budgets. Same layout rule as MetricGrid (metricGridClass:
 * 2 columns on mobile, 3 on tablet, 4 on desktop, never more columns than cards); the card is the dashboard's.
 */
export function ChartMetricGrid({ metrics, columns = 4 }: { metrics: ChartMetric[]; columns?: 2 | 3 | 4 }) {
  return (
    <div data-slot="metric-grid" data-columns={columns} className={metricGridClass(metrics.length, "gap-3", columns)}>
      {metrics.map((m) => (
        <div key={m.id} data-testid={`metric-${m.id}`} aria-label={m.ariaLabel ?? m.label} role="group" className="min-w-0">
          <MetricCard
            label={m.label}
            icon={m.icon}
            tone={m.tone}
            value={m.value}
            currency={m.currency}
            valueClassName={m.valueClassName}
            sub={m.sub}
            note={m.note}
            badgePct={m.badgePct}
            invertTone={m.invertTone}
            sparkData={m.sparkData}
            sparkLabels={m.sparkLabels}
            sparkColor={m.sparkColor}
            href={m.href}
          />
        </div>
      ))}
    </div>
  );
}
