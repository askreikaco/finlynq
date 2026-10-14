"use client";

import { Fragment, useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  TrendingUp, Plus, Coins,
} from "lucide-react";
import { useDevMode } from "@/hooks/use-dev-mode";
import { useDisplayCurrency } from "@/components/currency-provider";
import {
  HoldingEditForm,
  type HoldingEditFormHolding,
} from "@/components/holdings/holding-edit-form";
import { PerformanceChart } from "@/components/portfolio/PerformanceChart";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LazyView } from "@/components/ui/lazy-view";


import {
  ASSET_TYPE_CONFIG, REGION_COLORS, SECTOR_COLORS,
  type EnrichedHolding, type EtfXrayTab, type FilterType,
} from "./_types";
import { usePortfolioOverview, useBenchmarks } from "./_hooks/use-portfolio";
import { PortfolioSkeleton } from "./_components/portfolio-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { HOLDING_FILTER_KEYS, HOLDING_SORTS } from "@/lib/toolbar/list-configs";
import { sortRecords } from "@/lib/toolbar/sort";
import { ErrorState } from "@/components/error-state";
import { TopMoversCard } from "./_components/top-movers-card";
import { EtfXrayCard } from "./_components/etf-xray-card";
import { AllocationCharts } from "./_components/allocation-charts";
import { BenchmarkChart } from "./_components/benchmark-chart";
import { HoldingAccountGroups, accountHoldingTitle, type AccountHoldingGroup } from "./_components/holding-account-groups";
import { HEADER_DESKTOP_ONLY, CustomizeCardsSheet, useCardLayout, usePageCustomize } from "@/components/mobile";
import { SectionPage } from "@/components/templates/section-page";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportByHoldingToCSV } from "./_components/csv";
import type { PageCard } from "@/lib/card-layout";
import { PortfolioSummary } from "./_components/mobile-portfolio";
import { InvestmentTransactions } from "./_components/investment-transactions";

// ── Main Page ───────────────────────────────────────────────────────
/** Customizable sections of the investments page, default order. Dev-only ones show only in dev mode. */
const PORTFOLIO_CARDS: readonly (PageCard & { devOnly?: boolean })[] = [
  { id: "performance", title: "Performance" },
  { id: "summary", title: "Summary" },
  { id: "top-movers", title: "Top movers" },
  { id: "holdings", title: "Holdings" },
  { id: "transactions", title: "Investment transactions" },
  { id: "xray", title: "ETF X-ray", devOnly: true },
  { id: "allocation", title: "Allocation" },
  { id: "benchmarks", title: "Benchmarks", devOnly: true },
];

export default function PortfolioPage() {
  const devMode = useDevMode();
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
  const { data, loading, reload } = usePortfolioOverview(displayCurrency, currencyLoading);
  // One toolbar: range (cards), search, and the filter page (type, empty, currency) + sort.
  const metricRange = useMetricRange();
  const tb = useListToolbar({ filterPath: "/filter/holdings", sorts: HOLDING_SORTS, filterKeys: HOLDING_FILTER_KEYS });
  const filter: FilterType = (tb.filters.assetType as FilterType | undefined) ?? "all";
  // Edit/delete dialog for individual portfolio holdings. Null = closed.
  // (Create-mode was removed — "Add holding" now navigates to the consolidated
  // /settings/investments page; this dialog is edit-in-place only.)
  const [editingHolding, setEditingHolding] = useState<EnrichedHolding | null>(null);
  const [benchmarkPeriod, setBenchmarkPeriod] = useState("1y");
  const { benchmarks, benchmarkLoading } = useBenchmarks(benchmarkPeriod, !!devMode);
  // Holdings sort (compact control in the holdings toolbar): applies within each account.
  const [etfXrayTab, setEtfXrayTab] = useState<EtfXrayTab>("stocks");
  const [stocksPage, setStocksPage] = useState(1);
  const STOCKS_PER_PAGE = 25;
  // Show the All Holdings table in each holding's own (native) currency
  // instead of the display/reporting currency. Re-introduced after the API
  // started returning per-row native-currency rollups on `byHolding`; rows
  // that span multiple currencies fall back to display currency per-row.
  // Component-state only (resets on reload).
  const showNative = tb.filters.native === "1";
  // Hide entries with no current position. For table rows: quantity is null
  // or 0 (matches the row's own `hasMetrics` rule below — these are the
  // rows that already render as "--" across Qty/Avg/Mkt Value). For chart
  // buckets: aggregated value rounds to $0 (>0.005 keeps half-cent rounding
  // safe). Default on — empty rows are noise on a value-weighted view.
  // Toggle lives in the holdings table filter bar.
  const hideEmpty = tb.filters.empty !== "1";

  // Holdings grouped per account (one HoldingRow list per account). Type filter and hide-empty apply to
  // each holding; the sort applies within each account; accounts are listed by name.
  const accountGroupRows = useMemo<AccountHoldingGroup[]>(() => {
    if (!data?.holdings) return [];
    const keep = (h: EnrichedHolding) =>
      (filter === "all" || h.assetType === filter) &&
      (!hideEmpty || (h.quantity ?? 0) !== 0 || (h.marketValueDisplay ?? 0) !== 0);
    const needle = tb.q.trim().toLowerCase();
    const matches = (h: EnrichedHolding) => !needle || `${accountHoldingTitle(h)} ${h.name ?? ""}`.toLowerCase().includes(needle);
    const byAccount = new Map<string, EnrichedHolding[]>();
    for (const h of data.holdings) {
      if (!keep(h) || !matches(h)) continue;
      byAccount.set(h.accountName, [...(byAccount.get(h.accountName) ?? []), h]);
    }
    return Array.from(byAccount.entries())
      .sort(([x], [y]) => (x ?? "").localeCompare(y ?? ""))
      .map(([accountName, holdings]) => ({
        accountName,
        holdings: sortRecords(holdings, tb.sort, {
          name: (h) => accountHoldingTitle(h),
          amount: (h) => h.marketValueDisplay ?? 0,
          unrealized: (h) => h.unrealizedGainPct ?? 0,
        }),
      }));
  }, [data, filter, hideEmpty, tb.q, tb.sort]);

  const cardLayout = useCardLayout("portfolio", PORTFOLIO_CARDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  usePageCustomize(data?.summary && data.summary.totalHoldings > 0 ? { onOpen: () => setCustomizeOpen(true) } : null);

  if (loading) return <PortfolioSkeleton />;
  if (!data || !data.summary) return <ErrorState title="Couldn't load investments" message="We couldn't load your investments. Please try again." onRetry={reload} />;

  // Empty state — no holdings yet
  if (data.summary.totalHoldings === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-info/10 text-info">
          <TrendingUp className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No holdings yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Add investment accounts and holdings to track your investment performance.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/accounts/new?returnTo=/portfolio" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors">
            Add Account
          </Link>
          <Link href="/import" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
            Import Data
          </Link>
        </div>
      </div>
    );
  }

  const { summary, byType, etfXray, topGainers, topLosers } = data;

  // Allocation data — value-weighted in display currency. `value` powers
  // both slice size and legend amount; we filter zero-value buckets when
  // hideEmpty is on (>0.005 keeps half-cent rounding safe).
  const allocationByType = Object.entries(byType)
    .filter(([, v]) => v.count > 0 && (!hideEmpty || v.value > 0.005))
    .map(([type, v]) => ({
      name: ASSET_TYPE_CONFIG[type]?.label ?? type,
      value: v.value,
      pct: summary.totalValueDisplay > 0
        ? Math.round((v.value / summary.totalValueDisplay) * 100)
        : 0,
      color: ASSET_TYPE_CONFIG[type]?.color ?? "#64748b",
    }));

  const allocationByAccount = Object.entries(data.byAccount)
    .filter(([, v]) => v.count > 0 && (!hideEmpty || v.value > 0.005))
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([name, v]) => ({
      name,
      value: v.value,
      pct: summary.totalValueDisplay > 0
        ? Math.round((v.value / summary.totalValueDisplay) * 100)
        : 0,
    }));

  // ETF X-Ray data
  const regionData = Object.entries(etfXray.regions)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, pct]) => ({ name, pct, color: REGION_COLORS[name] ?? "#64748b" }));

  const sectorData = Object.entries(etfXray.sectors)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, pct]) => ({ name, pct, color: SECTOR_COLORS[name] ?? "#64748b" }));

  const hasEtfData = etfXray.etfCount > 0;
  const hasPositions = (data.byHolding ?? []).some((r) => r.totalQty !== 0 || r.marketValueDisplay !== 0);

  // Each customizable section, keyed by PORTFOLIO_CARDS id; rendered in the user's saved order (see below).
  const cardNodes: Record<string, ReactNode> = {
    performance: (
      <>
      {/* Phase 3 performance chart (empty state explains how to populate /portfolio_snapshots). */}
      <div className={cn(!hasPositions && "max-regular:hidden")}>
        <PerformanceChart accountId={null} />
      </div>

      </>
    ),
    summary: (
      <>
      <PortfolioSummary summary={summary} currency={displayCurrency} range={metricRange} />

      </>
    ),
    "top-movers": (
      <>
      {(topGainers.length > 0 || topLosers.length > 0) && (
        <div className="grid grid-cols-1 regular:grid-cols-2 gap-4">
          {topGainers.length > 0 && (
            <TopMoversCard kind="gainers" movers={topGainers} currency={displayCurrency} />
          )}
          {topLosers.length > 0 && (
            <TopMoversCard kind="losers" movers={topLosers} currency={displayCurrency} />
          )}
        </div>
      )}

      </>
    ),
    holdings: (
      <>
      <div data-slot="portfolio-toolbar" className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => exportByHoldingToCSV(data.byHolding ?? [], data.displayCurrency ?? displayCurrency)}
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
      </div>
      {/* Holdings per account: one list at every width. Tap a holding for its sheet (Edit, Lots, transactions). */}
      <HoldingAccountGroups
        groups={accountGroupRows}
        displayCurrency={displayCurrency}
        showNative={showNative}
        onEdit={setEditingHolding}
      />

      </>
    ),
    transactions: (
      <>
      <InvestmentTransactions refreshKey={data} />

      </>
    ),
    xray: (
      <>
      {devMode && hasEtfData && (
        <EtfXrayCard
          etfXray={etfXray}
          etfXrayTab={etfXrayTab}
          setEtfXrayTab={setEtfXrayTab}
          stocksPage={stocksPage}
          setStocksPage={setStocksPage}
          stocksPerPage={STOCKS_PER_PAGE}
          regionData={regionData}
          sectorData={sectorData}
          displayCurrency={displayCurrency}
        />
      )}

      </>
    ),
    allocation: (
      <>
      <LazyView minHeight={300}>
        <AllocationCharts
          allocationByType={allocationByType}
          allocationByAccount={allocationByAccount}
          displayCurrency={displayCurrency}
        />
      </LazyView>

      </>
    ),
    benchmarks: (
      <>
      {devMode && (
        <LazyView minHeight={300}>
          <BenchmarkChart
            benchmarks={benchmarks}
            benchmarkLoading={benchmarkLoading}
            benchmarkPeriod={benchmarkPeriod}
            setBenchmarkPeriod={setBenchmarkPeriod}
          />
        </LazyView>
      )}

      </>
    ),
  };

  return (
    <SectionPage
      id="portfolio"
      title="Investment"
      subtitle={`${summary.totalHoldings} holdings across ${summary.totalAccounts} accounts`}
      width="report"
      header={{
        overflow: [
          { label: "Realized gains", icon: TrendingUp, href: "/portfolio/realized-gains" },
          { label: "Dividends", icon: Coins, href: "/portfolio/dividends" },
        ],
        filter: { href: tb.filterHref, activeCount: tb.activeCount },
        actions: <>
          <Link
            href="/portfolio/realized-gains"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), HEADER_DESKTOP_ONLY)}
          >
            Realized gains
          </Link>
          <Link
            href="/portfolio/dividends"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), HEADER_DESKTOP_ONLY)}
          >
            Dividends
          </Link>
          {/* Add holding → the consolidated /settings/investments page (the old
              inline create dialog was removed; securities are defined + linked
              to accounts there). Per-row edit-in-place stays on the dialog below. */}
          <Link
            href="/settings/investments"
            className={buttonVariants({ size: "sm" })}
            aria-label="Add holding"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add<span className="max-regular:sr-only"> holding</span>
          </Link>
        </>,
      }}
    >

      {/* Re-login prompt — surfaces when the server couldn't decrypt
          tx.portfolio_holding (cold DEK cache after a server restart).
          Without this the page would render every encrypted tx as a separate
          orphan row because each AES-GCM IV is unique. */}
      {(data.undecryptedTxCount ?? 0) > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 shrink-0">
            <span className="text-warning font-semibold">!</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning">
              {data.undecryptedTxCount} transaction{data.undecryptedTxCount === 1 ? "" : "s"} couldn&apos;t be decrypted
            </p>
            <p className="text-xs text-warning/80 mt-0.5">
              Your session needs to refresh after the last deploy.{" "}
              {/* Link to /cloud (sign-in page) instead of non-existent /login route */}
              <Link href="/cloud" className="underline font-medium">Sign in again</Link>{" "}
              to unlock your portfolio data.
            </p>
          </div>
        </div>
      )}

      <PageToolbar refresh
        range={{ selection: metricRange.selection, onChange: metricRange.setSelection }}
        search={{ value: tb.q, onChange: tb.setQ, placeholder: "Search holdings" }}
      />

      {cardLayout.layout.order
        .filter((id) => !cardLayout.layout.hidden.includes(id) && (devMode || !PORTFOLIO_CARDS.find((c) => c.id === id)?.devOnly))
        .map((id) => (
          <Fragment key={id}>{cardNodes[id]}</Fragment>
        ))}

      <CustomizeCardsSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        title="Customize investments"
        description="Show, hide and reorder the sections of your investments page."
        cards={PORTFOLIO_CARDS.filter((c) => devMode || !c.devOnly)}
        layout={cardLayout.layout}
        onSave={cardLayout.save}
        onReset={cardLayout.reset}
      />

      {/* Edit / create holding dialog — wraps the shared
          <HoldingEditForm> from src/components/holdings/holding-edit-form.tsx.
          Issue #100: the inline HoldingEditDialog that previously lived
          here was extracted so /settings/investments can mount the SAME
          form. Edits never silently diverge between the two surfaces
          because there's only one component. */}
      <Dialog
        open={editingHolding !== null}
        onOpenChange={(open) => {
          if (!open) setEditingHolding(null);
        }}
      >
        <DialogContent className="regular:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Holding</DialogTitle>
          </DialogHeader>
          {editingHolding !== null && (
            <HoldingEditForm
              holdingId={editingHolding.id}
              initialHolding={holdingFromEnriched(editingHolding)}
              onCancel={() => setEditingHolding(null)}
              onSave={() => {
                setEditingHolding(null);
                reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </SectionPage>
  );
}

/**
 * Adapter from `EnrichedHolding` (the rich row type used by /portfolio)
 * down to the small subset that the shared form needs. Skips the extra
 * GET round-trip in the form's edit path because we already have the
 * row hydrated in the page state.
 */
function holdingFromEnriched(h: EnrichedHolding): HoldingEditFormHolding {
  return {
    id: h.id,
    accountId: h.accountId,
    name: h.name,
    symbol: h.symbol,
    currency: h.currency,
    isCrypto: (h as unknown as { isCrypto?: number }).isCrypto ?? null,
    note: (h as unknown as { note?: string }).note ?? null,
  };
}
