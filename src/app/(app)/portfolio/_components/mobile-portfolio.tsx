"use client";

/**
 * Portfolio summary and holdings Cards view (G2-11, one adaptive UI).
 *
 * - PortfolioSummary: hero (total value, day change, total gain) and a metric grid. Shown at
 *   every size. The grid gains columns with the size class (2 compact, 3 regular, 6 wide).
 * - HoldingCards: the Cards view of the holdings, one row each (name | market value | unrealized %).
 *   Tapping a row opens a DetailSheet with the fields the row leaves out.
 * The type filter chips and the Cards/List toggle live in the page toolbar (portfolio-ui.tsx).
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyAdaptive } from "@/lib/currency";
import { formatPercent, getDisplayLocale } from "@/lib/locale";
import { Amount, DetailSheet, HoldingRow, SectionCard, SectionLabel, StatTile, type MetricItem } from "@/components/mobile";
import type { ByHoldingRow, EnrichedHolding, OverviewData } from "../_types";

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
      <SectionCard className="space-y-3">
        <div>
          <SectionLabel>Total value</SectionLabel>
          <Amount value={summary.totalValueDisplay} currency={currency} size="hero" tone="none" className="mt-1 block" />
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
      <div data-slot="metric-grid" className="grid grid-cols-2 gap-3 regular:grid-cols-3 wide:grid-cols-6">
        {metrics.map((m) => (
          <StatTile
            key={m.label}
            label={m.label}
            className={m.regularOnly ? "hidden regular:block" : undefined}
            value={
              m.currency ? (
                <Amount value={m.value} currency={m.currency} size="md" tone={m.tone ?? "none"} showSign={m.showSign} />
              ) : (
                <span className="tabular-nums text-sm font-semibold">{m.value}</span>
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

export function HoldingCards({
  holdings,
  members,
  currency,
}: {
  holdings: ByHoldingRow[];
  members: Map<string, EnrichedHolding[]>;
  currency: string;
}) {
  const [open, setOpen] = useState<ByHoldingRow | null>(null);
  const money = (n: number | null | undefined) => (n == null ? "--" : formatCurrencyAdaptive(n, currency));
  const accounts = open ? Array.from(new Set((members.get(open.key) ?? []).map((h) => h.accountName).filter(Boolean))) : [];
  return (
    <section data-slot="portfolio-holding-cards" className="space-y-2">
      <SectionLabel>Holdings</SectionLabel>
      <SectionCard padded={false} className="divide-y divide-border/50 px-3">
        {holdings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No holdings match this filter.</p>
        ) : (
          holdings.map((r) => (
            <HoldingRow
              key={r.key}
              name={holdingRowTitle(r)}
              marketValue={r.marketValueDisplay}
              unrealizedPct={r.assetType === "cash" ? null : r.unrealizedGainPct}
              currency={currency}
              onPress={() => setOpen(r)}
            />
          ))
        )}
      </SectionCard>

      <DetailSheet
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? holdingRowTitle(open) : ""}
        description={open && open.description && open.description !== open.symbol ? open.description : undefined}
        items={
          open
            ? [
                { label: "Quantity", value: open.totalQty.toLocaleString(getDisplayLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 6 }) },
                { label: "Avg cost", value: money(open.avgCostDisplay) },
                { label: "Price", value: money(open.currentPriceDisplay) },
                { label: "Market value", value: money(open.marketValueDisplay) },
                { label: "Cost basis", value: money(open.costBasisDisplay) },
                {
                  label: "Unrealized G/L",
                  value: (
                    <span className={tone(open.unrealizedGainDisplay)}>
                      {open.unrealizedGainDisplay >= 0 ? "+" : ""}
                      {formatCurrency(open.unrealizedGainDisplay, currency)}
                      {open.unrealizedGainPct != null ? ` (${signed(open.unrealizedGainPct)})` : ""}
                    </span>
                  ),
                },
                {
                  label: "Realized G/L",
                  value: (
                    <span className={tone(open.realizedGainDisplay)}>
                      {open.realizedGainDisplay >= 0 ? "+" : ""}
                      {formatCurrency(open.realizedGainDisplay, currency)}
                    </span>
                  ),
                },
                { label: accounts.length === 1 ? "Account" : "Accounts", value: accounts.length ? accounts.join(", ") : "--" },
              ]
            : []
        }
      />
    </section>
  );
}
