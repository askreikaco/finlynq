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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ArrowDownLeft, ArrowUpLeft, RefreshCw, Coins, SlidersHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { exportCsv, type CsvColumn } from "@/lib/csv-export";
import {
  PageHeader,
  HEADER_DESKTOP_ONLY,
  Amount,
  CompactOnly,
  FromMd,
  ListRow,
  DetailSheet,
  MetricGrid,
  SectionCard,
  SectionLabel,
  type DetailItem,
  type MetricItem,
} from "@/components/mobile";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { ChipGroup, ReportFilterSheet, monthLabel, signedPercent } from "../_components/report-controls";

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

const GROUP_MODE_LABELS: Record<GroupMode, string> = {
  off: "Off",
  holding: "By holding",
  account: "By account",
  holding_account: "Holding + account",
};

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
  const [taxYear, setTaxYear] = useState<number | null>(CURRENT_YEAR);
  const [term, setTerm] = useState<"all" | "short" | "long">("all");
  // FINLYNQ-183: the toggle now switches between per-row native currency and
  // the unified DISPLAY-currency view (there is no separate "base currency").
  const [showUnified, setShowUnified] = useState(false);
  // FINLYNQ-193 — additive view options (component-state only, resets on
  // reload; matches the FINLYNQ-129/172 toggle precedent).
  const [hideZero, setHideZero] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("off");
  const [data, setData] = useState<ApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openLot, setOpenLot] = useState<ApiRow | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (taxYear) params.set("taxYear", String(taxYear));
    params.set("term", term);
    if (showUnified) params.set("unified", "1");
    setLoading(true);
    setLoadError(false);
    fetch(`/api/portfolio/realized-gains?${params.toString()}`)
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        if (json.success) setData(json.data);
        else { setData(null); setLoadError(true); }
      })
      .catch(() => { setData(null); setLoadError(true); })
      .finally(() => setLoading(false));
  }, [taxYear, term, showUnified, reloadKey]);

  // FINLYNQ-193 mixed-currency rule: group-by is UNIFIED-VIEW-ONLY. The
  // unified view converts every closure into the single display currency, so
  // summing realized gain across a group is always one-currency-correct.
  // Native view rows are each in their own sleeve currency, so a group could
  // span multiple currencies — we never sum those. The selector is disabled
  // in native view; this effect also resets a stale mode if the user turns
  // the unified toggle back off while grouped.
  useEffect(() => {
    if (!showUnified && groupMode !== "off") setGroupMode("off");
  }, [showUnified, groupMode]);

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

  const summaryMetrics = useMemo<MetricItem[]>(() => {
    const items: MetricItem[] = [];
    if (showUnified && data?.totalRealizedGainInBase != null) {
      items.push({ label: `Realized (${unifiedCurrency})`, value: visibleTotalInBase, currency: unifiedCurrency, tone: "auto", showSign: true });
    } else {
      for (const [ccy, t] of Object.entries(visibleByCurrency)) {
        items.push({ label: `Realized (${ccy})`, value: t.realizedGain, currency: ccy, tone: "auto", showSign: true });
      }
    }
    items.push({ label: "Closed lots", value: visibleRows.length });
    return items;
  }, [data, showUnified, unifiedCurrency, visibleTotalInBase, visibleByCurrency, visibleRows.length]);

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

  const yearChoices = [
    CURRENT_YEAR,
    CURRENT_YEAR - 1,
    CURRENT_YEAR - 2,
    CURRENT_YEAR - 3,
  ];

  const exportDisabled = loading || !data || visibleCount === 0;

  // Subtitle = the active period and view, so the header says what is on screen.
  const periodLabel = [
    taxYear ? String(taxYear) : "All time",
    term === "all" ? "All terms" : term === "short" ? "Short-term" : "Long-term",
    showUnified ? unifiedCurrency : "Native currency",
  ].join(" · ");

  // Rendered twice (md+ toolbar and the mobile sheet); no element ids inside, so no clash.
  const filterFields = (
    <>
      <ChipGroup
        label="Tax year"
        options={[
          ...yearChoices.map((y) => ({ value: String(y), label: String(y) })),
          { value: "all", label: "All time" },
        ]}
        value={taxYear === null ? "all" : String(taxYear)}
        onChange={(v) => setTaxYear(v === "all" ? null : Number(v))}
      />
      <ChipGroup
        label="Term"
        options={[
          { value: "all", label: "All" },
          { value: "short", label: "Short (≤365d)" },
          { value: "long", label: "Long (>365d)" },
        ]}
        value={term}
        onChange={(v) => setTerm(v)}
      />
      <ChipGroup
        label="Currency"
        options={[
          { value: "native", label: "Native" },
          { value: "unified", label: `In ${unifiedCurrency}` },
        ]}
        value={showUnified ? "unified" : "native"}
        onChange={(v) => setShowUnified(v === "unified")}
      />
      <ChipGroup
        label="Zero-gain rows"
        options={[
          { value: "show", label: "Show all" },
          { value: "hide", label: "Hide zero-gain" },
        ]}
        value={hideZero ? "hide" : "show"}
        onChange={(v) => setHideZero(v === "hide")}
      />
      {/* Mixed-currency rule: grouping sums realized gain across closures,
          which is only single-currency-safe in the unified display view. */}
      <ChipGroup
        label="Group by"
        options={(["off", "holding", "account", "holding_account"] as const).map((m) => ({ value: m, label: GROUP_MODE_LABELS[m] }))}
        value={groupMode}
        onChange={(v) => setGroupMode(v)}
        disabled={!showUnified}
      />
      {!showUnified && (
        <p className="text-xs text-muted-foreground">
          Switch to “In {unifiedCurrency}” to group (avoids summing across native currencies).
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        backHref="/portfolio"
        backLabel="Back to portfolio"
        title="Realized gains"
        subtitle={periodLabel}
        titleClassName="text-2xl font-bold tracking-tight"
        subtitleClassName="text-sm text-muted-foreground mt-0.5"
        actions={
          <>
            <CompactOnly as="span">
              <Button
                variant="outline"
                size="icon"
                aria-label="Filters"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className="size-4" />
              </Button>
            </CompactOnly>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={exportDisabled}
              className={HEADER_DESKTOP_ONLY}
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
          </>
        }
        overflow={[{ label: "Export CSV", icon: Download, onSelect: handleExportCsv, disabled: exportDisabled }]}
      />

      {/* md+ filter toolbar (below md the same fields live in ReportFilterSheet). */}
      <FromMd className="flex flex-wrap gap-x-8 gap-y-4 rounded-xl border border-border/50 bg-card p-4">
        {filterFields}
      </FromMd>
      <ReportFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filter realized gains">
        {filterFields}
      </ReportFilterSheet>

      {!loading && data && data.rows.length > 0 && <MetricGrid metrics={summaryMetrics} />}

      <section aria-label="Closed lots" className="space-y-2">
        {loading ? (
          <PageSkeleton variant="list" rows={3} />
        ) : loadError ? (
          <ErrorState title="Couldn't load realized gains" message="We couldn't load your realized gains. Please try again." onRetry={() => setReloadKey((k) => k + 1)} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No closed lots yet"
            description="Lots are created on every new sell or in-kind transfer. Pre-Phase-1 history is filled in by the lot backfill admin script."
            action={{ label: "Record a sale", href: "/portfolio/new?op=sell" }}
          />
        ) : visibleCount === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-border/50 bg-card p-4">
            <p className="text-sm text-muted-foreground">
              No rows match the current filters. Every closure in this range has a zero realized gain.
            </p>
            <Button variant="outline" size="sm" onClick={() => setHideZero(false)}>
              Show zero-gain rows
            </Button>
          </div>
        ) : (
          <>
            <CompactOnly>
              {grouped ? (
                <SectionCard label={groupMode === "account" ? "By account" : groupMode === "holding" ? "By holding" : "By holding and account"} padded={false} className="divide-y divide-border/50 px-3">
                  {groupRows.map((g) => (
                    <ListRow
                      key={g.key}
                      title={groupMode === "account" ? g.accountLabel : g.holdingLabel}
                      subtitle={`${g.closureCount} closure${g.closureCount === 1 ? "" : "s"} · ${g.qtyClosed} sh · ${g.earliestClose === g.latestClose ? g.earliestClose : `${g.earliestClose} → ${g.latestClose}`}`}
                      value={<Amount value={g.realizedGain} currency={unifiedCurrency} size="md" tone="auto" showSign />}
                    />
                  ))}
                </SectionCard>
              ) : (
                Array.from(groupLotsByMonth(visibleRows)).map(([ym, lots]) => (
                  <section key={ym} className="space-y-2">
                    <SectionLabel>{monthLabel(ym)}</SectionLabel>
                    <SectionCard padded={false} className="divide-y divide-border/50 px-3">
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
                    </SectionCard>
                  </section>
                ))
              )}
            </CompactOnly>

            <FromMd>
              {grouped ? (
                // FINLYNQ-193 — rolled-up grouped view. Per-share + date columns
                // collapse (not meaningful aggregated); we show qty + a closure
                // count + a date range + the summed realized gain (always in the
                // unified display currency, since grouping is unified-only).
                <Table containerClassName="max-h-[70dvh] overflow-y-auto rounded-xl border border-border/50">
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      {groupMode !== "account" && <TableHead>Holding</TableHead>}
                      {groupMode !== "holding" && <TableHead>Account</TableHead>}
                      <TableHead className="text-right">Closures</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Date range</TableHead>
                      <TableHead className="text-right">Realized ({unifiedCurrency})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupRows.map((g) => (
                      <TableRow key={g.key}>
                        {groupMode !== "account" && (
                          <TableCell>{g.holdingLabel}</TableCell>
                        )}
                        {groupMode !== "holding" && (
                          <TableCell>{g.accountLabel}</TableCell>
                        )}
                        <TableCell className="text-right">{g.closureCount}</TableCell>
                        <TableCell className="text-right">{g.qtyClosed}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {g.earliestClose === g.latestClose
                            ? g.earliestClose
                            : `${g.earliestClose} → ${g.latestClose}`}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={g.realizedGain} currency={unifiedCurrency} size="md" tone="auto" showSign className="font-mono" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table containerClassName="max-h-[70dvh] overflow-y-auto rounded-xl border border-border/50">
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Closed</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead>Holding</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Cost / sh</TableHead>
                      <TableHead className="text-right">Proceeds / sh</TableHead>
                      <TableHead className="text-right">Realized</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((r) => {
                      const kindMeta = CLOSE_KIND_META[r.closeKind] ?? null;
                      const KindIcon = kindMeta?.icon ?? null;
                      const inBase = showUnified && r.realizedGainInBase != null && r.baseCurrency;
                      return (
                        <TableRow key={r.closureId}>
                          <TableCell className="font-mono text-xs">{r.closeDate}</TableCell>
                          <TableCell className="font-mono text-xs">{r.openDate}</TableCell>
                          <TableCell className="text-xs">{r.daysHeld}</TableCell>
                          <TableCell>
                            <Badge variant={r.term === "long" ? "secondary" : "outline"}>
                              {r.term}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {KindIcon && (
                                <KindIcon className={`h-3.5 w-3.5 ${kindMeta!.className.split(" ").filter(c => c.startsWith("text-")).join(" ")}`} />
                              )}
                              <span>{holdingLabelOf(r)}</span>
                              {kindMeta && (
                                <Badge
                                  variant="outline"
                                  className={`text-xs h-5 px-1 ${kindMeta.className}`}
                                  title={kindMeta.tooltip}
                                >
                                  {kindMeta.label}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{accountLabelOf(r)}</TableCell>
                          <TableCell className="text-right">{r.qtyClosed}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(r.costPerShare, r.currency)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(r.proceedsPerShare, r.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Amount
                              value={inBase ? r.realizedGainInBase! : r.realizedGain}
                              currency={inBase ? r.baseCurrency! : r.currency}
                              size="md"
                              tone="auto"
                              showSign
                              className="font-mono"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </FromMd>
          </>
        )}
      </section>

      {openLot && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpenLot(null)}
          title={holdingLabelOf(openLot)}
          description={CLOSE_KIND_META[openLot.closeKind]?.tooltip}
          items={lotDetailItems(openLot)}
        />
      )}
    </div>
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
