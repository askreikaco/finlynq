"use client";

/**
 * Holdings on the Investment page, one layout at every width: a SectionCard per account, each holding a
 * HoldingRow (name | market value + unrealized %). A tap opens the holding's DetailSheet: quantity, average
 * cost, price, cost basis, the G/L split and the row's actions (Edit, Lots, View transactions).
 * Replaces the All Holdings table and the Holdings-by-account accordion. No <table>.
 */

import { useState } from "react";
import Link from "next/link";
import { formatCurrencyAdaptive, formatCurrency } from "@/lib/currency";
import { formatPercent, getDisplayLocale } from "@/lib/locale";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { DetailSheet, HoldingRow, SectionCard, type DetailItem } from "@/components/mobile";
import { LotInspectorDialog } from "@/components/portfolio/lot-inspector-dialog";
import { Button } from "@/components/ui/button";
import type { EnrichedHolding } from "../_types";

export interface AccountHoldingGroup {
  accountName: string;
  holdings: EnrichedHolding[];
}

const signed = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${formatPercent(n, digits)}`;
const tone = (n: number) => (n >= 0 ? "text-pos" : "text-destructive");

/** Row title: the ticker when there is one, else the holding name; cash rows read "Cash · <name>". */
export function accountHoldingTitle(h: EnrichedHolding): string {
  const base = h.symbol ?? h.name;
  return h.assetType === "cash" ? `Cash · ${base}` : base;
}

export function HoldingAccountGroups({
  groups,
  displayCurrency,
  showNative,
  onEdit,
}: {
  groups: AccountHoldingGroup[];
  displayCurrency: string;
  /** Show each holding in its own currency instead of the display currency. */
  showNative: boolean;
  onEdit: (h: EnrichedHolding) => void;
}) {
  const [open, setOpen] = useState<EnrichedHolding | null>(null);
  const [inspect, setInspect] = useState<EnrichedHolding | null>(null);

  if (groups.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No holdings match this filter.</p>;
  }

  const nativeCcyOf = (h: EnrichedHolding) => h.quoteCurrency ?? h.currency;
  const marketOf = (h: EnrichedHolding) => (showNative ? h.marketValue : h.marketValueDisplay) ?? 0;
  const ccyOf = (h: EnrichedHolding) => (showNative ? nativeCcyOf(h) : displayCurrency);

  return (
    <div className="space-y-6" data-slot="holdings-by-account">
      {groups.map((g) => (
        <SectionCard key={g.accountName} label={g.accountName} padded={false} className="divide-y divide-border/50 px-3">
          {g.holdings.map((h) => (
            <HoldingRow
              key={h.id}
              name={accountHoldingTitle(h)}
              marketValue={marketOf(h)}
              unrealizedPct={h.assetType === "cash" ? null : h.unrealizedGainPct}
              currency={ccyOf(h)}
              onPress={() => setOpen(h)}
            />
          ))}
        </SectionCard>
      ))}

      {open && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) setOpen(null); }}
          title={accountHoldingTitle(open)}
          description={open.accountName}
          items={holdingDetailItems(open, showNative, displayCurrency)}
        >
          <Button variant="outline" className="h-11" onClick={() => { const h = open; setOpen(null); onEdit(h); }}>Edit</Button>
          <Button variant="outline" className="h-11" onClick={() => { const h = open; setOpen(null); setInspect(h); }}>Lots</Button>
          {open.name && (
            <Link
              href={buildTxDrillUrl({ portfolioHolding: open.name, accountId: open.accountId ? String(open.accountId) : undefined })}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              View transactions
            </Link>
          )}
        </DetailSheet>
      )}

      <LotInspectorDialog
        open={inspect !== null}
        onOpenChange={(o) => { if (!o) setInspect(null); }}
        holdingId={inspect?.id ?? null}
        accountId={inspect?.accountId ?? null}
        holdingName={inspect?.name}
        accountName={inspect?.accountName}
      />
    </div>
  );
}

/** Label/value rows for the holding sheet, in the holding's own currency when `showNative`. */
export function holdingDetailItems(h: EnrichedHolding, showNative: boolean, displayCurrency: string): DetailItem[] {
  const nativeCcy = h.quoteCurrency ?? h.currency;
  const ccy = showNative ? nativeCcy : displayCurrency;
  const qty = h.quantity;
  const avgCost = showNative
    ? h.avgCostPerShare
    : h.costBasisDisplay != null && qty != null && qty !== 0
      ? h.costBasisDisplay / qty
      : null;
  const unreal = showNative ? h.unrealizedGain : h.unrealizedGainDisplay;
  const realized = showNative ? h.realizedGain : h.realizedGainDisplay;
  const basis = showNative ? h.totalCostBasis : h.costBasisDisplay;
  const market = showNative ? h.marketValue : h.marketValueDisplay;
  const items: DetailItem[] = [
    {
      label: "Quantity",
      value: qty != null ? (
        <>
          {qty.toLocaleString(getDisplayLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 6 })}
          {qty < 0 ? <span className="ml-1 text-xs uppercase tracking-wider text-destructive">short</span> : null}
        </>
      ) : "--",
    },
    { label: "Avg cost", value: avgCost != null ? formatCurrencyAdaptive(avgCost, ccy) : "--" },
    { label: "Price", value: h.price != null ? formatCurrencyAdaptive(h.price, nativeCcy) : "--" },
    { label: "Market value", value: market != null ? formatCurrencyAdaptive(market, ccy) : "--" },
    { label: "Cost basis", value: basis != null ? formatCurrencyAdaptive(basis, ccy) : "--" },
    {
      label: "Unrealized G/L",
      value: unreal != null ? (
        <span className={tone(unreal)}>
          {unreal >= 0 ? "+" : ""}
          {formatCurrency(unreal, ccy)}
          {h.unrealizedGainPct != null && !showNative ? ` (${signed(h.unrealizedGainPct)})` : ""}
        </span>
      ) : "--",
    },
    {
      label: "Realized G/L",
      value: realized != null ? (
        <span className={tone(realized)}>
          {realized >= 0 ? "+" : ""}
          {formatCurrency(realized, ccy)}
        </span>
      ) : "--",
    },
    { label: "Account", value: h.accountName },
  ];
  if (showNative) items.push({ label: "Currency", value: nativeCcy });
  return items;
}
