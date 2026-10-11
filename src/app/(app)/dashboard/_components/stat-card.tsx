"use client";

import type { LucideIcon } from "lucide-react";
import { MetricCard } from "@/components/metric-card";

type StatCardProps = {
  label: string;
  value: number;
  sub: string;
  /** Percentage badge before the sub-line (green up / red down); null/undefined = none. */
  badgePct?: number | null;
  icon: LucideIcon;
  iconBg: string;
  sparkColor: string;
  sparkData: number[];
  /** Optional "YYYY-MM" labels parallel to sparkData — enables the hover tooltip. */
  sparkLabels?: string[];
  /** Drill-through target; omitted = a static (non-link) card, e.g. on the Family overview. */
  href?: string;
  currency?: string;
};

/** Dashboard income / expense cards — a thin alias of the global MetricCard. */
export function StatCard({ iconBg, ...rest }: StatCardProps) {
  return <MetricCard {...rest} tone={iconBg} />;
}
