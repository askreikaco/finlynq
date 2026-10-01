"use client";

/**
 * Portfolio below md (native layout): hero (total value, day / total gain), 2-col metric grid,
 * and the holdings as simple rows (Name | Market value + Unrealized %). Tapping a row opens a
 * DetailSheet with every field the row leaves out. The desktop table/cards stay `max-md:hidden`
 * on the page; this component is `md:hidden`.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyAdaptive } from "@/lib/currency";
import { formatPercent, getDisplayLocale } from "@/lib/locale";
import { Amount, DetailSheet, HoldingRow, MetricGrid, SectionCard, SectionLabel, type MetricItem } from "@/components/mobile";
import { ASSET_TYPE_CONFIG, type ByHoldingRow, type EnrichedHolding, type FilterType, type OverviewData } from "../_types";

const signed = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${formatPercent(n, digits)}`;
const tone = (n: number) => (n >= 0 ? "text-pos" : "text-neg");

export function holdingRowTitle(r: ByHoldingRow): string {
  const base = r.symbol ?? r.name;
  return r.assetType === "cash" ? `Cash · ${base}` : base;
}

export function PortfolioMobileHero({ summary, currency }: { summary: OverviewData["summary"]; currency: string }) {
  const hasBasis = summary.hasQuantityData && summary.totalCostBasisDisplay > 0;
  const metrics: MetricItem[] = [
    { label: "Holdings", value: summary.totalHoldings },
    { label: "Accounts", value: summary.totalAccounts },
    ...(hasBasis
      ? ([
          { label: "Cost basis", value: summary.totalCostBasisDisplay, currency },
          { label: "Unrealized G/L", value: summary.totalUnrealizedGainDisplay, currency, tone: "auto", showSign: true },
          { label: "Realized G/L", value: summary.totalRealizedGainDisplay, currency, tone: "auto", showSign: true },
          { label: "Dividends", value: summary.totalDividendsDisplay, currency, tone: "pos", showSign: true },
        ] as MetricItem[])
      : [{ label: "Dividends", value: summary.totalDividendsDisplay, currency, tone: "pos", showSign: true } as MetricItem]),
  ];
  return (
    <div data-slot="portfolio-mobile-hero" className="space-y-3 md:hidden">
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
      <MetricGrid metrics={metrics} />
    </div>
  );
}

const CHIPS = ["all", "etf", "stock", "crypto", "metal", "cash"] as const;

export function MobileHoldingsList({
  holdings,
  members,
  currency,
  filter,
  setFilter,
  counts,
}: {
  holdings: ByHoldingRow[];
  members: Map<string, EnrichedHolding[]>;
  currency: string;
  filter: FilterType;
  setFilter: (f: FilterType) => void;
  counts: Record<string, number>;
}) {
  const [open, setOpen] = useState<ByHoldingRow | null>(null);
  const money = (n: number | null | undefined) => (n == null ? "--" : formatCurrencyAdaptive(n, currency));
  const accounts = open ? Array.from(new Set((members.get(open.key) ?? []).map((h) => h.accountName).filter(Boolean))) : [];
  return (
    <section data-slot="portfolio-mobile-holdings" className="space-y-2 md:hidden">
      <SectionLabel>Holdings</SectionLabel>
      <div role="group" aria-label="Filter holdings by type" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CHIPS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={filter === t}
            onClick={() => setFilter(t)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              filter === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
            )}
          >
            {t === "all" ? "All" : ASSET_TYPE_CONFIG[t]?.label ?? t}
            <span className="text-xs opacity-80">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>
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
