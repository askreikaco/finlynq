import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Hash } from "lucide-react";
import { MetricCard, type MetricTone } from "@/components/metric-card";
import { type AmountTone } from "./amount";
import { formatCurrency } from "@/lib/currency";

/**
 * One metric, rendered as the ONE metric card (src/components/metric-card.tsx, the Net Worth design).
 * `value` as a number is an animated money amount when `currency` is given and a plain count otherwise;
 * a string / node renders as-is ("3 / 5", "23 years").
 */
export interface MetricItem {
  label: string;
  value: number | ReactNode;
  /** Given -> rendered as money; omitted with a numeric value -> plain count. */
  currency?: string;
  /** Sign colour of the value. */
  tone?: AmountTone;
  showSign?: boolean;
  /** Stable id -> data-testid="metric-<id>" on the card wrapper. */
  id?: string;
  ariaLabel?: string;
  icon?: LucideIcon;
  /** Icon tile colour. */
  iconTone?: MetricTone;
  valueClassName?: string;
  /** Signed difference line ("+$1,234 vs last month", see formatDelta) or any one-line caption. */
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
  /** Drill-through target. */
  href?: string;
  className?: string;
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

const TONE_CLASS: Record<AmountTone, string> = {
  auto: "",
  pos: "text-pos",
  neg: "text-neg",
  muted: "text-muted-foreground",
  none: "",
};

function toneClass(m: MetricItem): string {
  const t = m.tone === "auto" && typeof m.value === "number" ? (m.value > 0 ? "pos" : m.value < 0 ? "neg" : "none") : (m.tone ?? "none");
  return [TONE_CLASS[t], m.valueClassName].filter(Boolean).join(" ");
}

/** A single metric as a MetricCard (also used by pages that lay cards out themselves). */
export function MetricItemCard({ m }: { m: MetricItem }) {
  const money = typeof m.value === "number" && !!m.currency;
  const value: ReactNode =
    money && m.showSign && (m.value as number) > 0
      ? <span>{`+${formatCurrency(m.value as number, m.currency!)}`}</span>
      : typeof m.value === "number" && !m.currency
        ? <span>{m.value}</span>
        : m.value;
  const card = (
    <MetricCard
      label={m.label}
      icon={m.icon ?? Hash}
      tone={m.iconTone}
      value={value}
      currency={money ? m.currency : undefined}
      valueClassName={toneClass(m)}
      sub={m.sub}
      note={m.note}
      badgePct={m.badgePct}
      invertTone={m.invertTone}
      sparkData={m.sparkData}
      sparkLabels={m.sparkLabels}
      sparkColor={m.sparkColor}
      href={m.href}
    />
  );
  return (
    <div data-testid={m.id ? `metric-${m.id}` : undefined} aria-label={m.id ? (m.ariaLabel ?? m.label) : m.ariaLabel} role={m.id ? "group" : undefined} className={`min-w-0${m.className ? ` ${m.className}` : ""}`}>
      {card}
    </div>
  );
}

/**
 * The layout wrapper for MetricCards (see METRIC_GRID_CLASS). `columns` caps the desktop column count
 * (default 4: 2 on mobile, 3 on tablet, 4 on desktop).
 */
export function MetricGrid({ metrics, columns = 4 }: { metrics: MetricItem[]; columns?: 2 | 3 | 4 }) {
  return (
    <div data-slot="metric-grid" data-columns={columns} className={metricGridClass(metrics.length, "gap-3", columns)}>
      {metrics.map((m) => (
        <MetricItemCard key={m.id ?? m.label} m={m} />
      ))}
    </div>
  );
}
