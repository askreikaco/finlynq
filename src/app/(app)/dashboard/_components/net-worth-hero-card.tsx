"use client";

import { Landmark } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { formatCurrency } from "@/lib/currency";

export interface NetWorthHeroCardProps {
  value: number;
  currency: string;
  /** Change over the comparison window; null hides the pill (no history). */
  change: number | null;
  changePct: number;
  /** Text after the change amount, e.g. "vs last month". */
  changeCaption: string;
  sparkData: number[];
  sparkLabels?: string[];
  /** Drill-through target; omitted = static card. */
  href?: string;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  /** Optional line under the number (shown instead of the pill when there is no change). */
  footnote?: string;
}

/**
 * The dashboard's "Total Net Worth" hero card (also rendered by the Family overview) — the
 * global MetricCard in its "hero" size: when the card is wide the sparkline fills a
 * right-hand column, when narrow it runs along the bottom.
 */
export function NetWorthHeroCard({
  value,
  currency,
  change,
  changePct,
  changeCaption,
  sparkData,
  sparkLabels,
  href,
  onMouseMove,
  footnote,
}: NetWorthHeroCardProps) {
  return (
    <MetricCard
      label="Total Net Worth"
      icon={Landmark}
      tone="indigo"
      size="hero"
      value={value}
      currency={currency}
      badgePct={change != null ? changePct : null}
      sub={change != null ? `${change >= 0 ? "+" : ""}${formatCurrency(change, currency)} ${changeCaption}` : undefined}
      note={footnote}
      sparkData={sparkData}
      sparkLabels={sparkLabels}
      sparkColor="#6366f1"
      href={href}
      onMouseMove={onMouseMove}
      className="mouse-glow"
    />
  );
}
