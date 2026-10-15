"use client";

/**
 * Realized-gain dashboard — Phase 2 of plan/portfolio-lots-and-performance.md.
 *
 * Reads /api/portfolio/realized-gains; renders one row per
 * holding_lot_closures row, sorted newest first. Tax-year + term
 * (short/long) filter chips on top; CSV export button hits the same
 * endpoint with `format=csv`.
 *
 * Empty-state copy is "No closed lots yet" rather than "no data" —
 * users whose lots backfill hasn't run yet (portfolio_lots_status not
 * populated) see this naturally.
 *
 * Presentation: a PageHeader page (not a dialog). Below md the lots are
 * grouped by close month as ListRows (tap = DetailSheet with every field);
 * md+ keeps the table with a sticky header inside its own scroll box.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowUpLeft, CalendarDays, Coins, Download, Landmark, Receipt, RefreshCw, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { exportCsv, type CsvColumn } from "@/lib/csv-export";
import { Amount, ListRow, MetricGrid } from "@/components/mobile";
import { Overlay, type DetailItem } from "@/components/ui/overlay";
import { SectionPage } from "@/components/templates/section-page";
import { Notice } from "@/components/notice";
import { monthLabel, signedPercent } from "../_components/report-controls";
import { PageToolbar } from "@/components/page-toolbar";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { REALIZED_FILTER_KEYS } from "@/lib/toolbar/list-configs";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { cardProps, countByMonth, makeCardResolver, sumByMonth } from "@/lib/metrics/series";
import { NO_HISTORY_CAPTION } from "@/lib/metrics/delta";
import { localDateISO } from "@/lib/utils/date";
import { Card, type CardProps } from "@/components/ui/card";

// Phase 3 follow-up (2026-05-26): short_close = a Buy that covered a short
// position; gain inverts (cost − buy_price). short_open = the audit-marker
// row written when a Sell overflows into a new short lot. The other
// close_kind values are normal long-position closures + special cases.
const CLOSE_KIND_META: Record<string, { icon: typeof ArrowDownLeft; label: string; className: string; tooltip: string }> = {
  short_open: {
    icon: ArrowDownLeft,
    label: "Short open",
    className: "border-destructive text-destructive",
    tooltip: "Short opened — a Sell exceeded the open longs and opened a new side='short' lot at the sell price.",
  },
  short_close: {
    icon: ArrowUpLeft,
    label: "Short close",
    className: "border-warning text-warning",
    tooltip: "Short covered — a Buy on this holding/account closed an open short lot. Realized gain = (open cost − buy price) × qty.",
  },
  swap_out: {
    icon: RefreshCw,
    label: "Swap",
    className: "border-info text-info",
    tooltip: "Closure originated from a Swap (sell-out leg of an in-place rebalance).",
  },
  fx_conversion: {
    icon: Coins,
    label: "Currency",
    className: "border-chart-5 text-chart-5",
    tooltip: "Currency-on-currency FX gain — a cash lot in this sleeve was closed by an FX conversion. The realized gain in the sleeve currency is 0 (cost=1, proceeds=1); the actual gain shows in the unified display-currency view (toggle above).",
  },
};

interface ApiRow {
  closureId: number;
  closeDate: string;
  openDate: string;
  holdingId: number;
  holdingName: string | null;
  accountId: number;
  accountName: string | null;
  qtyClosed: number;
  proceedsPerShare: number;
  costPerShare: number;
  realizedGain: number;
  currency: string;
  daysHeld: number;
  term: "short" | "long";
  closeKind: string;
  realizedGainInBase?: number;
  baseCurrency?: string;
}

interface ApiResponse {
  success: boolean;
  data: {
    rows: ApiRow[];
    totals: {
      realizedGain: number;
      qtyClosed: number;
      rowCount: number;
      byCurrency: Record<string, { realizedGain: number; qtyClosed: number }>;
    };
    totalRealizedGainInBase?: number;
  };
}

const CURRENT_YEAR = new Date().getFullYear();

// FINLYNQ-193 — group-by modes for the rolled-up view. "off" keeps the
// flat one-row-per-closure list (the legacy view).
type GroupMode = "off" | "holding" | "account" | "holding_account";

/**
 * One rolled-up group row. Aggregates qty + realized gain across its member
 * closures. We ALWAYS sum the unified (display-currency) gain — grouping is
 * only ever enabled in the unified view (see the mixed-currency rule below),
 * so summing across a group never crosses native currencies.
 */
interface GroupRow {
  key: string;
  holdingLabel: string;
  accountLabel: string;
  qtyClosed: number;
  /** Sum of member `realizedGainInBase` (unified display currency). */
  realizedGain: number;
  closureCount: number;
  earliestClose: string;
  latestClose: string;
}

const holdingLabelOf = (r: ApiRow) => r.holdingName ?? `#${r.holdingId}`;
const accountLabelOf = (r: ApiRow) => r.accountName ?? `#${r.accountId}`;

/** Realized gain as a percent of the cost of the closed shares (native terms). */
function gainPctOf(r: ApiRow): number | null {
  const cost = r.costPerShare * r.qtyClosed;
  return cost > 0 ? (r.realizedGain / cost) * 100 : null;
}

/**
 * Aggregate flat closure rows into group rows. Pure. Caller guarantees
 * `unified` rows carry `realizedGainInBase` (grouping is unified-only), so the
 * summed gain is always in a single currency and never crosses native ccys.
 */
function buildGroupRows(rows: ApiRow[], mode: GroupMode): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const r of rows) {
    const hLabel = holdingLabelOf(r);
    const aLabel = accountLabelOf(r);
    let key: string;
    if (mode === "holding") key = `h:${r.holdingId}`;
    else if (mode === "account") key = `a:${r.accountId}`;
    else key = `h:${r.holdingId}|a:${r.accountId}`; // holding_account
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        holdingLabel: mode === "account" ? "" : hLabel,
        accountLabel: mode === "holding" ? "" : aLabel,
        qtyClosed: 0,
        realizedGain: 0,
        closureCount: 0,
        earliestClose: r.closeDate,
        latestClose: r.closeDate,
      };
      map.set(key, g);
    }
    g.qtyClosed += r.qtyClosed;
    g.realizedGain += r.realizedGainInBase ?? 0;
    g.closureCount += 1;
    if (r.closeDate < g.earliestClose) g.earliestClose = r.closeDate;
    if (r.closeDate > g.latestClose) g.latestClose = r.closeDate;
  }
  // Sort by absolute realized gain desc — largest movers first.
  return [...map.values()].sort(
    (a, b) => Math.abs(b.realizedGain) - Math.abs(a.realizedGain),
  );
}

/** The fields a mobile lot row leaves out, shown in its DetailSheet. */
function lotDetailItems(r: ApiRow): DetailItem[] {
  const items: DetailItem[] = [
    { label: "Closed", value: r.closeDate },
    { label: "Opened", value: r.openDate },
    { label: "Days held", value: r.daysHeld },
    { label: "Term", value: r.term === "long" ? "Long-term" : "Short-term" },
    { label: "Account", value: accountLabelOf(r) },
    { label: "Qty closed", value: r.qtyClosed },
    { label: "Cost / share", value: formatCurrency(r.costPerShare, r.currency) },
    { label: "Proceeds / share", value: formatCurrency(r.proceedsPerShare, r.currency) },
    {
      label: `Realized (${r.currency})`,
      value: <Amount value={r.realizedGain} currency={r.currency} size="md" tone="auto" showSign />,
    },
  ];
  if (r.realizedGainInBase != null && r.baseCurrency) {
    items.push({
      label: `Realized (${r.baseCurrency})`,
      value: <Amount value={r.realizedGainInBase} currency={r.baseCurrency} size="md" tone="auto" showSign />,
    });
  }
  items.push({ label: "Kind", value: CLOSE_KIND_META[r.closeKind]?.label ?? r.closeKind });
  return items;
}

export default function RealizedGainsPage() {
  const { displayCurrency } = useDisplayCurrency();
  // Filters live in the URL and are set on the filter page; the toolbar's range feeds the metric cards.
  const tb = useListToolbar({ filterPath: "/filter/realized-gains", filterKeys: REALIZED_FILTER_KEYS });
  const taxYear: number | null = tb.filters.taxYear === "all" ? null : Number(tb.filters.taxYear) || CURRENT_YEAR;
  const term: "all" | "short" | "long" = tb.filters.term === "short" || tb.filters.term === "long" ? tb.filters.term : "all";
  // FINLYNQ-129/172: native (each closure in its own currency) vs the unified display-currency view.
  const showUnified = tb.filters.currency === "unified";
  // FINLYNQ-193: additive view options.
  const hideZero = tb.filters.hideZero === "1";
  const groupMode: GroupMode = showUnified
    ? ((["holding", "account", "holding_account"] as const).find((m) => m === tb.filters.groupMode) ?? "off")
    : "off";
  const [openLot, setOpenLot] = useState<ApiRow | null>(null);
  const metricRange = useMetricRange();
  const rangeArg = useMemo(
    () => ({ selection: metricRange.selection, explicit: metricRange.explicit, period: metricRange.period }),
    [metricRange.selection, metricRange.explicit, metricRange.period],
  );

  // Cache-first: a revisit paints the last rows / metric cards at once and revalidates in the background.
  const gainsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (taxYear) params.set("taxYear", String(taxYear));
    params.set("term", term);
    if (showUnified) params.set("unified", "1");
    return `/api/portfolio/realized-gains?${params.toString()}`;
  }, [taxYear, term, showUnified]);
  const gainsRes = useCacheFirstJson<ApiResponse>(gainsUrl, { keepPrevious: true });
  const data: ApiResponse["data"] | null = gainsRes.data?.success ? gainsRes.data.data : null;
  const loading = gainsRes.loading;
  const loadError = gainsRes.error || (gainsRes.data !== undefined && !gainsRes.data?.success);
  const reloadGains = gainsRes.reload;

  // FINLYNQ-193 mixed-currency rule: group-by is UNIFIED-VIEW-ONLY (groupMode above is "off" in the native view).

  // The unified currency is always the user's display currency; the server
  // stamps it onto each row's `baseCurrency`, so prefer that and fall back to
  // the provider value before any row loads.
  const unifiedCurrency = data?.rows[0]?.baseCurrency ?? displayCurrency;

  // FINLYNQ-193 — apply hide-zero over the figure CURRENTLY DISPLAYED: the
  // unified `realizedGainInBase` in unified view, the native `realizedGain`
  // otherwise. So the row that shows `0` on screen is the one hidden.
  const visibleRows = useMemo<ApiRow[]>(() => {
    const rows = data?.rows ?? [];
    if (!hideZero) return rows;
    return rows.filter((r) => {
      const shown =
        showUnified && r.realizedGainInBase != null
          ? r.realizedGainInBase
          : r.realizedGain;
      return shown !== 0;
    });
  }, [data, hideZero, showUnified]);

  // Grouping only ever runs in the unified view (guarded above), so member
  // gains are all in `unifiedCurrency`.
  const grouped = groupMode !== "off";
  const groupRows = useMemo<GroupRow[]>(
    () => (grouped ? buildGroupRows(visibleRows, groupMode) : []),
    [grouped, visibleRows, groupMode],
  );

  // Summary tiles + closed-lot count reflect the VISIBLE (filtered/grouped)
  // set — consistent with hide-zero and grouping.
  const visibleCount = grouped ? groupRows.length : visibleRows.length;
  const visibleByCurrency = useMemo(() => {
    const acc: Record<string, { realizedGain: number; qtyClosed: number }> = {};
    for (const r of visibleRows) {
      const cell = acc[r.currency] ?? { realizedGain: 0, qtyClosed: 0 };
      cell.realizedGain += r.realizedGain;
      cell.qtyClosed += r.qtyClosed;
      acc[r.currency] = cell;
    }
    return acc;
  }, [visibleRows]);
  const visibleTotalInBase = useMemo(
    () => visibleRows.reduce((s, r) => s + (r.realizedGainInBase ?? 0), 0),
    [visibleRows],
  );

  const summaryMetrics = useMemo<CardProps[]>(() => {
    const items: CardProps[] = [];
    // Monthly history of the closed lots in view (their close dates). A tax-year load is complete for that year, so
    // its empty months are real zeros; earlier months were not loaded and give no comparison.
    const today = localDateISO().slice(0, 7);
    const through = taxYear && `${taxYear}-12` < today ? `${taxYear}-12` : today;
    const from = taxYear ? `${taxYear}-01` : undefined;
    const money = (label: string, ccy: string, total: number, rows: ApiRow[], valueOf: (r: ApiRow) => number): CardProps => {
      const c = makeCardResolver(rangeArg, ccy)(rows.length > 0 ? sumByMonth(rows, (r) => r.closeDate, valueOf, through, from) : [], "sum");
      return { icon: Wallet,
        title: label, value: c.value ?? total, currency: ccy, valueTone: "auto", showSign: true, ...cardProps(c), sub: c.delta ?? NO_HISTORY_CAPTION,
        ...(c.value != null ? { note: `Total in view: ${formatCurrency(total, ccy)}` } : {}),
      };
    };
    if (showUnified && data?.totalRealizedGainInBase != null) {
      const complete = visibleRows.every((r) => r.realizedGainInBase != null);
      items.push(money(`Realized (${unifiedCurrency})`, unifiedCurrency, visibleTotalInBase, complete ? visibleRows : [], (r) => r.realizedGainInBase ?? 0));
    } else {
      for (const [ccy, t] of Object.entries(visibleByCurrency)) {
        items.push(money(`Realized (${ccy})`, ccy, t.realizedGain, visibleRows.filter((r) => r.currency === ccy), (r) => r.realizedGain));
      }
    }
    const lots = makeCardResolver(rangeArg)(visibleRows.length > 0 ? countByMonth(visibleRows, (r) => r.closeDate, through, from) : [], "sum", undefined, "count");
    items.push({
      icon: Receipt, title: "Closed lots", value: <span>{lots.value ?? visibleRows.length}</span>, ...cardProps(lots), sub: lots.delta ?? NO_HISTORY_CAPTION,
      ...(lots.value != null ? { note: `Total in view: ${visibleRows.length}` } : {}),
    });
    return items;
  }, [data, showUnified, unifiedCurrency, visibleTotalInBase, visibleByCurrency, visibleRows, taxYear, rangeArg]);

  // FINLYNQ-193 — CSV now reflects the active hide-zero + group-by state, so
  // the download byte-matches what's on screen. Built CLIENT-SIDE from the
  // already-fetched rows via the shared `exportCsv` helper — the server route,
  // `realizedGainsToCsv`, and MCP/mobile flat shape are all untouched.
  const handleExportCsv = () => {
    const yearTag = taxYear ? `-${taxYear}` : "";
    if (grouped) {
      const columns: CsvColumn<GroupRow>[] = [];
      if (groupMode !== "account")
        columns.push({ header: "holding", accessor: (g) => g.holdingLabel });
      if (groupMode !== "holding")
        columns.push({ header: "account", accessor: (g) => g.accountLabel });
      columns.push(
        { header: "closures", accessor: (g) => g.closureCount },
        { header: "qty_closed", accessor: (g) => g.qtyClosed },
        { header: "earliest_close", accessor: (g) => g.earliestClose },
        { header: "latest_close", accessor: (g) => g.latestClose },
        { header: "realized_gain", accessor: (g) => g.realizedGain },
        { header: "currency", accessor: () => unifiedCurrency },
      );
      exportCsv(groupRows, columns, `realized-gains${yearTag}-grouped.csv`);
      return;
    }
    // Flat (filtered) export — mirrors the server CSV columns, but over the
    // hide-zero-filtered visible set, plus the unified column when active.
    const columns: CsvColumn<ApiRow>[] = [
      { header: "close_date", accessor: (r) => r.closeDate },
      { header: "open_date", accessor: (r) => r.openDate },
      { header: "days_held", accessor: (r) => r.daysHeld },
      { header: "term", accessor: (r) => r.term },
      { header: "holding", accessor: (r) => holdingLabelOf(r) },
      { header: "account", accessor: (r) => accountLabelOf(r) },
      { header: "qty_closed", accessor: (r) => r.qtyClosed },
      { header: "cost_per_share", accessor: (r) => r.costPerShare },
      { header: "proceeds_per_share", accessor: (r) => r.proceedsPerShare },
      { header: "realized_gain", accessor: (r) => r.realizedGain },
      { header: "currency", accessor: (r) => r.currency },
      { header: "close_kind", accessor: (r) => r.closeKind },
    ];
    if (showUnified) {
      columns.push(
        {
          header: `realized_gain_${unifiedCurrency.toLowerCase()}`,
          accessor: (r) => r.realizedGainInBase ?? "",
        },
        { header: "unified_currency", accessor: () => unifiedCurrency },
      );
    }
    exportCsv(visibleRows, columns, `realized-gains${yearTag}.csv`);
  };

  const exportDisabled = loading || !data || visibleCount === 0;

  // Subtitle = the active period and view, so the header says what is on screen.
  const periodLabel = [
    taxYear ? String(taxYear) : "All time",
    term === "all" ? "All terms" : term === "short" ? "Short-term" : "Long-term",
    showUnified ? unifiedCurrency : "Native currency",
  ].join(" · ");

  return (
    <SectionPage
      id="realized-gains"
      title="Realized gains"
      info={periodLabel}
      back={{ href: "/portfolio", label: "Back to portfolio" }}
      width="none"
      minW0={false}
      padBottom="none"
      stack="4"
      className="regular:space-y-6"
      header={{
        more: [{ label: "Export CSV", icon: Download, onSelect: handleExportCsv, disabled: exportDisabled }],
        filter: { href: tb.filterHref, activeCount: tb.activeCount },
      }}
    >

      <PageToolbar refresh
        range={{ selection: metricRange.selection, onChange: metricRange.setSelection }}
      />

      {!loading && data && data.rows.length > 0 && (
        <>
          <MetricGrid metrics={summaryMetrics} />
        </>
      )}

      <section aria-label="Closed lots" className="space-y-2">
        {loading ? (
          <Notice variant="skeleton" skeleton="list" rows={3} />
        ) : loadError ? (
          <Notice variant="error" title="Couldn't load realized gains" retry={reloadGains}>{"We couldn't load your realized gains. Please try again."}</Notice>
        ) : !data || data.rows.length === 0 ? (
          <Notice
            variant="empty"
            icon={Coins}
            title="No closed lots yet"
            action={{ label: "Record a sale", href: "/portfolio/new?op=sell" }}
          >
            Lots are created on every new sell or in-kind transfer. Pre-Phase-1 history is filled in by the lot backfill admin script.
          </Notice>
        ) : visibleCount === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-border/50 bg-card p-4">
            <p className="text-sm text-muted-foreground">
              No rows match the current filters. Every closure in this range has a zero realized gain.
            </p>
            <Button variant="outline" size="sm" href={tb.filterHref()}>
              Show zero-gain rows
            </Button>
          </div>
        ) : (
          <>
              <>
              {grouped ? (
                <Card title={groupMode === "account" ? "By account" : groupMode === "holding" ? "By holding" : "By holding and account"} icon={Landmark} tone="indigo" frame="list">
                  {groupRows.map((g) => (
                    <ListRow
                      key={g.key}
                      title={groupMode === "account" ? g.accountLabel : g.holdingLabel}
                      subtitle={`${g.closureCount} closure${g.closureCount === 1 ? "" : "s"} · ${g.qtyClosed} sh · ${g.earliestClose === g.latestClose ? g.earliestClose : `${g.earliestClose} → ${g.latestClose}`}`}
                      value={<Amount value={g.realizedGain} currency={unifiedCurrency} size="md" tone="auto" showSign />}
                    />
                  ))}
                </Card>
              ) : (
                Array.from(groupLotsByMonth(visibleRows)).map(([ym, lots]) => (
                  <section key={ym}>
                    <Card title={monthLabel(ym)} icon={CalendarDays} tone="muted" frame="list">
                      {lots.map((r) => {
                        const inBase = showUnified && r.realizedGainInBase != null && r.baseCurrency;
                        const amount = inBase ? r.realizedGainInBase! : r.realizedGain;
                        const ccy = inBase ? r.baseCurrency! : r.currency;
                        const pct = gainPctOf(r);
                        return (
                          <ListRow
                            key={r.closureId}
                            title={holdingLabelOf(r)}
                            subtitle={`${r.closeDate} · ${accountLabelOf(r)}`}
                            value={<Amount value={amount} currency={ccy} size="md" tone="auto" showSign />}
                            secondary={pct == null ? undefined : signedPercent(pct)}
                            secondaryTone={pct == null ? "muted" : pct >= 0 ? "pos" : "neg"}
                            onPress={() => setOpenLot(r)}
                            aria-label={`${holdingLabelOf(r)}, closed ${r.closeDate}`}
                          />
                        );
                      })}
                    </Card>
                  </section>
                ))
              )}
              </>
          </>
        )}
      </section>

      {openLot && (
        <Overlay
          variant="detail"
          open
          onClose={() => setOpenLot(null)}
          title={holdingLabelOf(openLot)}
          info={CLOSE_KIND_META[openLot.closeKind]?.tooltip}
          items={lotDetailItems(openLot)}
        />
      )}
    </SectionPage>
  );
}

/** Lots bucketed by close month ("YYYY-MM"), keeping the API's newest-first order. */
function groupLotsByMonth(rows: ApiRow[]): Map<string, ApiRow[]> {
  const out = new Map<string, ApiRow[]>();
  for (const r of rows) {
    const ym = r.closeDate.slice(0, 7);
    const list = out.get(ym);
    if (list) list.push(r);
    else out.set(ym, [r]);
  }
  return out;
}
