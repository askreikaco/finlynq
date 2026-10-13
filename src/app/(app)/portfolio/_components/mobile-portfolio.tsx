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
import { MetricItemCard, type MetricItem } from "@/components/mobile";
import { MetricCard } from "@/components/metric-card";
import { Landmark } from "lucide-react";
import { MetricRangeSelect } from "@/components/metric-range-select";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { cardProps, makeCardResolver } from "@/lib/metrics/series";
import { buildPortfolioSeries } from "@/lib/metrics/portfolio-series";
import { usePortfolioMetricSources } from "../_hooks/use-portfolio-metric-sources";
import { localDateISO } from "@/lib/utils/date";
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
  const sources = usePortfolioMetricSources(currency);
  const hasBasis = summary.hasQuantityData && summary.totalCostBasisDisplay > 0;
  // Every card: this month vs last month by default, or the selected range vs the one before (src/lib/metrics).
  const metricRange = useMetricRange();
  const card = makeCardResolver(metricRange, currency);
  const series = buildPortfolioSeries({
    perf: sources.perf,
    dividends: sources.dividends,
    gains: sources.gains,
    displayCurrency: currency,
    throughMonth: localDateISO().slice(0, 7),
  });
  const valueCard = card(series.value, "last", summary.totalValueDisplay);
  const costCard = card(series.cost, "last", summary.totalCostBasisDisplay);
  const unrealizedCard = card(series.unrealized, "last", summary.totalUnrealizedGainDisplay);
  const realizedCard = card(series.realized, "last", summary.totalRealizedGainDisplay);
  const dividendsCard = card(series.dividends, "last", summary.totalDividendsDisplay);
  const returnCard = card(series.totalReturn, "last", summary.totalReturnDisplay);
  const metrics: SummaryMetric[] = [
    { label: "Holdings", value: summary.totalHoldings },
    { label: "Accounts", value: summary.totalAccounts },
    ...(hasBasis
      ? ([
          { label: "Cost basis", value: costCard.value ?? summary.totalCostBasisDisplay, currency, ...cardProps(costCard) },
          { label: "Unrealized G/L", value: unrealizedCard.value ?? summary.totalUnrealizedGainDisplay, currency, tone: "auto", showSign: true, ...cardProps(unrealizedCard) },
          { label: "Realized G/L", value: realizedCard.value ?? summary.totalRealizedGainDisplay, currency, tone: "auto", showSign: true, ...cardProps(realizedCard) },
          { label: "Dividends", value: dividendsCard.value ?? summary.totalDividendsDisplay, currency, tone: "pos", showSign: true, ...cardProps(dividendsCard) },
          { label: "Total return", value: returnCard.value ?? summary.totalReturnDisplay, currency, tone: "auto", showSign: true, regularOnly: true, ...cardProps(returnCard) },
        ] as SummaryMetric[])
      : [{ label: "Dividends", value: dividendsCard.value ?? summary.totalDividendsDisplay, currency, tone: "pos", showSign: true, ...cardProps(dividendsCard) } as SummaryMetric]),
  ];
  return (
    <div data-slot="portfolio-summary" className="space-y-3">
      <MetricRangeSelect value={metricRange.selection} onChange={metricRange.setSelection} />
      <div data-testid="metric-total-value" className="min-w-0">
        <MetricCard
          label="Total value"
          icon={Landmark}
          tone="indigo"
          size="hero"
          value={valueCard.value ?? summary.totalValueDisplay}
          currency={currency}
          sparkColor="#6366f1"
          {...cardProps(valueCard)}
          note={
            <span className="grid grid-cols-2 gap-3" data-slot="hero-notes">
              <span data-slot="hero-day" className="block">
                <span className="block font-semibold">Day change</span>
                <span className={cn("block tabular-nums font-semibold", tone(summary.dayChangeDisplay))}>
                  {summary.dayChangeDisplay >= 0 ? "+" : ""}
                  {formatCurrency(summary.dayChangeDisplay, currency)} ({signed(summary.dayChangePct)})
                </span>
              </span>
              {hasBasis && (
                <span data-slot="hero-total" className="block">
                  <span className="block font-semibold">Total gain</span>
                  <span className={cn("block tabular-nums font-semibold", tone(summary.totalUnrealizedGainDisplay))}>
                    {summary.totalUnrealizedGainDisplay >= 0 ? "+" : ""}
                    {formatCurrency(summary.totalUnrealizedGainDisplay, currency)} ({signed(summary.totalUnrealizedGainPct)})
                  </span>
                </span>
              )}
            </span>
          }
        />
      </div>
      <div data-slot="metric-grid" className={metricGridClass(metrics.length)}>
        {metrics.map((m) => (
          <MetricItemCard key={m.label} m={{ ...m, className: m.regularOnly ? "max-regular:hidden" : m.className }} />
        ))}
      </div>
    </div>
  );
}
