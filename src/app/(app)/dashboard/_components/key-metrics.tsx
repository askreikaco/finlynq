"use client";

import { MetricCard } from "@/components/metric-card";
import { PiggyBank, Scale } from "lucide-react";
import type { HealthData } from "./types";

// Higher savings rate is better; lower DTI is better. Neutral (muted) is used
// when a figure can't be computed or is flagged unreliable, so we never paint a
// suspect number green/red.
const NEUTRAL = "text-muted-foreground";
function toneForSavings(pct: number): string {
  if (pct >= 20) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
// 36% / 43% are the conventional mortgage-lending front/back-end DTI thresholds.
function toneForDti(pct: number): string {
  if (pct <= 36) return "text-emerald-600 dark:text-emerald-400";
  if (pct <= 43) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

/**
 * FINLYNQ-291 — surfaces savings rate and debt-to-income as first-class
 * home-page figures. Both are computed by the financial-health calculator but
 * previously appeared only as normalized 0-100 sub-scores inside the composite
 * Financial Health card (real % hover/modal-only; DTI could vanish entirely via
 * the anomaly backstop). Data is passed down from the dashboard page (which
 * already fetches `/api/health-score`), so this adds no extra request.
 */
export type KeyMetricsData = Pick<HealthData, "savingsRatePct" | "dti">;

export interface KeyMetricsProps {
  health: KeyMetricsData | null;
  /** Window caption of the savings rate (dashboard: "last 3 months"). */
  savingsWindow?: string;
  /**
   * Per-metric "can't be shown" reason (Family overview: section not shared). The cell then reads
   * "—" in the neutral tone with this text, never a computed or zero figure.
   */
  unavailable?: { savings?: string; dti?: string };
}

export function KeyMetrics({
  health,
  savingsWindow = "last 3 months",
  unavailable,
}: KeyMetricsProps) {
  const loading = health === null;
  const savings = unavailable?.savings
    ? null
    : (health?.savingsRatePct ?? null);
  const dtiPct = unavailable?.dti ? null : (health?.dti?.pct ?? null);
  const dtiReliable = health?.dti?.reliable ?? true;

  const cells = [
    {
      key: "savings",
      label: "Savings Rate",
      icon: PiggyBank,
      value: savings != null ? `${savings}%` : "—",
      tone: savings != null ? toneForSavings(savings) : NEUTRAL,
      sub:
        unavailable?.savings ??
        (savings != null
          ? `of income saved · ${savingsWindow}`
          : "No income data yet"),
    },
    {
      key: "dti",
      label: "Debt-to-Income",
      icon: Scale,
      value: dtiPct != null ? `${dtiPct}%` : "—",
      // Only a MISSING figure is painted neutral. `reliable:false` used to mean
      // "this number is probably inflated by card spend"; since 2026-08-27 it
      // means the opposite — a revolving account was capped at the balance it
      // carries, so the figure is the CORRECTED one. Greying it out would tell
      // the user to distrust the better number.
      tone: dtiPct == null ? NEUTRAL : toneForDti(dtiPct),
      sub:
        unavailable?.dti ??
        (dtiPct == null
          ? "No income data yet"
          : dtiReliable
            ? "debt payments vs income · last 12 months"
            : // 2026-08-27: `reliable:false` now means a revolving account was
              // capped at the balance it carries because payments exceeded it —
              // the pay-in-full case. Say that, rather than the old "go check
              // your data", which pointed the user at nothing actionable.
              "cards paid in full excluded · last 12 months"),
    },
  ];

  // Two global MetricCards (same design as every other metric card).
  return (
    // side by side only when the slot is wide enough; stacked next to the Net Worth hero
    <div className="@container h-full">
      <div className="grid h-full grid-cols-1 gap-4 @lg:grid-cols-2">
        {cells.map((c) => (
          <MetricCard
            key={c.key}
            label={c.label}
            icon={c.icon}
            tone={c.key === "savings" ? "emerald" : "amber"}
            value={c.value}
            valueClassName={c.tone}
            sub={c.sub}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}
