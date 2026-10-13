"use client";

/**
 * Portfolio summary and holdings Cards view (G2-11, one adaptive UI).
 *
 * - PortfolioSummary: hero (total value, day change, total gain) and a metric grid. Shown at
 *   every size. The grid gains columns with the size class (2 compact, 3 regular, 6 wide).
 * Holdings themselves render per account in holding-account-groups.tsx (HoldingRow lists + DetailSheet).
 */

import { metricGridClass } from "@/components/mobile/metric-grid";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { formatPercent } from "@/lib/locale";
import { Amount, SectionCard, MetricItemCard, type MetricItem } from "@/components/mobile";
import type { ByHoldingRow, OverviewData } from "../_types";

const signed = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${formatPercent(n, digits)}`;
const tone = (n: number) => (n >= 0 ? "text-pos" : "text-neg");

export function holdingRowTitle(r: ByHoldingRow): string {
  const base = r.symbol ?? r.name;
  return r.assetType === "cash" ? `Cash · ${base}` : base;
}

type SummaryMetric = MetricItem & {
  /** Shown from the regular size class up only. */
  regularOnly?: boolean;
};

export function PortfolioSummary({ summary, currency }: { summary: OverviewData["summary"]; currency: string }) {
  const hasBasis = summary.hasQuantityData && summary.totalCostBasisDisplay > 0;
  const metrics: SummaryMetric[] = [
    { label: "Holdings", value: summary.totalHoldings },
    { label: "Accounts", value: summary.totalAccounts },
    ...(hasBasis
      ? ([
          { label: "Cost basis", value: summary.totalCostBasisDisplay, currency },
          { label: "Unrealized G/L", value: summary.totalUnrealizedGainDisplay, currency, tone: "auto", showSign: true },
          { label: "Realized G/L", value: summary.totalRealizedGainDisplay, currency, tone: "auto", showSign: true },
          { label: "Dividends", value: summary.totalDividendsDisplay, currency, tone: "pos", showSign: true },
          { label: "Total return", value: summary.totalReturnDisplay, currency, tone: "auto", showSign: true, regularOnly: true },
        ] as SummaryMetric[])
      : [{ label: "Dividends", value: summary.totalDividendsDisplay, currency, tone: "pos", showSign: true } as SummaryMetric]),
  ];
  return (
    <div data-slot="portfolio-summary" className="space-y-3">
      <SectionCard label="Total value" className="space-y-3">
        <div>
          <Amount value={summary.totalValueDisplay} currency={currency} size="hero" tone="none" className="block" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div data-slot="hero-day">
            <p className="font-semibold text-muted-foreground">Day change</p>
            <p className={cn("tabular-nums font-semibold", tone(summary.dayChangeDisplay))}>
              {summary.dayChangeDisplay >= 0 ? "+" : ""}
              {formatCurrency(summary.dayChangeDisplay, currency)} ({signed(summary.dayChangePct)})
            </p>
          </div>
          {hasBasis && (
            <div data-slot="hero-total">
              <p className="font-semibold text-muted-foreground">Total gain</p>
              <p className={cn("tabular-nums font-semibold", tone(summary.totalUnrealizedGainDisplay))}>
                {summary.totalUnrealizedGainDisplay >= 0 ? "+" : ""}
                {formatCurrency(summary.totalUnrealizedGainDisplay, currency)} ({signed(summary.totalUnrealizedGainPct)})
              </p>
            </div>
          )}
        </div>
      </SectionCard>
      <div data-slot="metric-grid" className={metricGridClass(metrics.length)}>
        {metrics.map((m) => (
          <MetricItemCard key={m.label} m={{ ...m, className: m.regularOnly ? "max-regular:hidden" : m.className }} />
        ))}
      </div>
    </div>
  );
}
