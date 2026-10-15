"use client";

/**
 * Portfolio summary and holdings Cards view (G2-11, one adaptive UI).
 *
 * - PortfolioSummary: hero (total value, day change, total gain) and a metric grid. Shown at
 *   every size. The grid gains columns with the size class (2 compact, 3 regular, 6 wide).
 * Holdings themselves render per account in holding-account-groups.tsx (HoldingRow lists + DetailSheet).
 */

import { MetricCard, type MetricCardProps } from "@/components/metric-card";
import { metricGridClass } from "@/components/mobile/metric-grid";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { formatPercent } from "@/lib/locale";
import { Coins, Landmark, Layers, Percent, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { PageToolbar } from "@/components/page-toolbar";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { cardProps, makeCardResolver } from "@/lib/metrics/series";
import { NO_HISTORY_CAPTION } from "@/lib/metrics/delta";
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

export function PortfolioSummary({ summary, currency, range }: { summary: OverviewData["summary"]; currency: string; range?: ReturnType<typeof useMetricRange> }) {
  const sources = usePortfolioMetricSources(currency);
  const hasBasis = summary.hasQuantityData && summary.totalCostBasisDisplay > 0;
  // Every card: this month vs last month by default, or the selected range vs the one before (src/lib/metrics).
  // The page owns the range (and renders the PageToolbar) so its toolbar is one row; standalone, the summary brings its own.
  const ownRange = useMetricRange();
  const metricRange = range ?? ownRange;
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
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const rawMetrics: MetricCardProps[] = [
    { icon: Layers, label: "Holdings", value: <span>{summary.totalHoldings}</span>, sub: `Across ${plural(summary.totalAccounts, "account", "accounts")}` },
    { icon: Landmark, label: "Accounts", value: <span>{summary.totalAccounts}</span>, sub: `${summary.totalAccounts} with holdings` },
    ...(hasBasis
      ? ([
          { icon: Wallet, label: "Cost basis", value: costCard.value ?? summary.totalCostBasisDisplay, currency, ...cardProps(costCard) },
          { icon: TrendingUp, label: "Unrealized G/L", value: unrealizedCard.value ?? summary.totalUnrealizedGainDisplay, currency, valueTone: "auto", showSign: true, ...cardProps(unrealizedCard) },
          { icon: Coins, label: "Realized G/L", value: realizedCard.value ?? summary.totalRealizedGainDisplay, currency, valueTone: "auto", showSign: true, ...cardProps(realizedCard) },
          { icon: PiggyBank, label: "Dividends", value: dividendsCard.value ?? summary.totalDividendsDisplay, currency, valueTone: "pos", showSign: true, ...cardProps(dividendsCard) },
          { icon: Percent, label: "Total return", value: returnCard.value ?? summary.totalReturnDisplay, currency, valueTone: "auto", showSign: true, cellClassName: "max-regular:hidden", ...cardProps(returnCard) },
        ] as MetricCardProps[])
      : [{ icon: PiggyBank, label: "Dividends", value: dividendsCard.value ?? summary.totalDividendsDisplay, currency, valueTone: "pos", showSign: true, ...cardProps(dividendsCard) } as MetricCardProps]),
  ];
  // Every tile carries a sub-line: its delta when there is history, a muted caption otherwise (never an invented number).
  const metrics = rawMetrics.map((m) => (m.sub || m.delta?.text ? m : { ...m, sub: NO_HISTORY_CAPTION }));
  return (
    <div data-slot="portfolio-summary" className="space-y-3">
      {!range && <PageToolbar refresh range={{ selection: metricRange.selection, onChange: metricRange.setSelection }} />}
      <MetricCard
          id="total-value"
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
      <div data-slot="metric-grid" className={metricGridClass(metrics.length)}>
        {metrics.map((m) => (
          <MetricCard key={String(m.label)} {...m} />
        ))}
      </div>
    </div>
  );
}
