"use client";

import { StatTile } from "./stat-tile";
import { Amount } from "./amount";

export interface MetricItem {
  label: string;
  value: number;
  currency?: string;
  className?: string;
}

interface MetricGridProps {
  metrics: MetricItem[];
}

export function MetricGrid({ metrics }: MetricGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {metrics.map((metric, index) => (
        <StatTile
          key={index}
          label={metric.label}
          value={
            metric.currency ? (
              <Amount
                value={metric.value}
                currency={metric.currency}
                size="md"
                className={metric.className}
              />
            ) : (
              <span className={metric.className}>{metric.value}</span>
            )
          }
        />
      ))}
    </div>
  );
}
