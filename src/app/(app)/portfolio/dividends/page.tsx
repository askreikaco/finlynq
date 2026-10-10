"use client";

/**
 * Dividend-income dashboard — Phase 2 of plan/portfolio-lots-and-performance.md.
 *
 * Quarterly / annual / per-holding views. Reads
 * /api/portfolio/dividends with a `groupBy` param. Negative-amount
 * rows (withholding tax, corrections) surface as a separate badge
 * count per group rather than being netted.
 *
 * FINLYNQ-182 — Year/Quarter pivot one row per period with a money column per
 * currency (native pivot, `pivot=1`); a "Show in reporting currency" toggle
 * collapses to a single reporting-currency Total computed from STORED
 * `reporting_amount` (`reportingCurrency=1`, never a render-time FX
 * conversion); date filters (from/to + tax-year) wired across all three views.
 *
 * Presentation: a PageHeader page (not a dialog). Below md the groups are
 * ListRows (tap = DetailSheet); md+ keeps the table with a sticky header.
 */

import { useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, SlidersHorizontal, Coins } from "lucide-react";
import { useDisplayCurrency } from "@/components/currency-provider";
import {
  PageHeader,
  HEADER_DESKTOP_ONLY,
  Amount,
  CompactOnly,
  DetailSheet,
  FromMd,
  ListRow,
  MetricGrid,
  SectionCard,
  type DetailItem,
  type MetricItem,
} from "@/components/mobile";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { ChipGroup, ReportFilterSheet } from "../_components/report-controls";

interface CurrencyCell {
  amount: number;
  rowCount: number;
  reinvestedCount: number;
  withholdingCount: number;
}

interface GroupRow {
  bucket: string;
  label: string;
  amount: number;
  currency: string;
  rowCount: number;
  reinvestedCount: number;
  withholdingCount: number;
  byCurrency?: Record<string, CurrencyCell>;
  unratedCount?: number;
}

interface ApiResponse {
  success: boolean;
  data: {
    groups?: GroupRow[];
    totals: {
      amount: number;
      rowCount: number;
      byCurrency: Record<string, number>;
      unratedCount?: number;
    };
    mode?: "native" | "reporting";
    reportingCurrency?: string;
  };
}

type GroupBy = "quarter" | "year" | "holding";

const CURRENT_YEAR = new Date().getFullYear();
// Tax-year choices: this year back through ~10 years.
const TAX_YEARS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - i);

export default function DividendsPage() {
  const { displayCurrency } = useDisplayCurrency();
  const [groupBy, setGroupBy] = useState<GroupBy>("year");
  const [reporting, setReporting] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [taxYear, setTaxYear] = useState<string>("");
  const [data, setData] = useState<ApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<GroupRow | null>(null);

  // Build the shared param set (used by both the fetch and the CSV link) so
  // the export always reflects the active mode + filters.
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("groupBy", groupBy);
    if (reporting) params.set("reportingCurrency", "1");
    else params.set("pivot", "1"); // native = one row per period, currency columns
    if (taxYear) params.set("taxYear", taxYear);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }, [groupBy, reporting, taxYear, from, to]);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/portfolio/dividends?${queryParams.toString()}`)
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        if (json.success) setData(json.data);
        else { setData(null); setLoadError(true); }
      })
      .catch(() => { setData(null); setLoadError(true); })
      .finally(() => setLoading(false));
  }, [queryParams, reloadKey]);

  const csvHref = useMemo(() => {
    const params = new URLSearchParams(queryParams);
    params.set("format", "csv");
    return `/api/portfolio/dividends?${params.toString()}`;
  }, [queryParams]);

  // Currencies present (native pivot) → one money column each.
  const currencyColumns = useMemo(() => {
    if (reporting || !data?.groups) return [];
    const set = new Set<string>();
    for (const g of data.groups) {
      for (const c of Object.keys(g.byCurrency ?? {})) set.add(c);
    }
    return [...set].sort();
  }, [data, reporting]);

  const reportingCcy = data?.reportingCurrency ?? displayCurrency;
  const firstHeader = groupBy === "holding" ? "Holding" : "Period";
  const hasFilters = Boolean(from || to || taxYear);

  function clearFilters() {
    setFrom("");
    setTo("");
    setTaxYear("");
  }

  const summaryMetrics = useMemo<MetricItem[]>(() => {
    if (!data) return [];
    const items: MetricItem[] = [];
    if (reporting) {
      items.push({ label: `Total (${reportingCcy})`, value: data.totals.amount, currency: reportingCcy, tone: "auto", showSign: true });
    } else {
      for (const [ccy, total] of Object.entries(data.totals.byCurrency)) {
        items.push({ label: `Total (${ccy})`, value: total, currency: ccy, tone: "auto", showSign: true });
      }
    }
    items.push({ label: "Dividend rows", value: data.totals.rowCount });
    return items;
  }, [data, reporting, reportingCcy]);

  const periodLabel = [
    groupBy === "year" ? "By year" : groupBy === "quarter" ? "By quarter" : "By holding",
    reporting ? reportingCcy : "Native currency",
    hasFilters ? "Filtered" : taxYear ? taxYear : "All years",
  ].join(" · ");

  // Amounts for one group: reporting total, or one amount per currency (native pivot).
  const groupAmounts = (g: GroupRow) =>
    reporting ? (
      <Amount value={g.amount} currency={reportingCcy} size="md" tone="auto" showSign />
    ) : (
      currencyColumns.map((c) => {
        const cell = g.byCurrency?.[c];
        return cell ? (
          <Amount key={c} value={cell.amount} currency={c} size="md" tone="auto" showSign />
        ) : null;
      })
    );

  // idp keeps element ids unique: the fields render twice (md+ toolbar and the mobile sheet).
  const filterFields = (idp: string) => (
    <>
      <ChipGroup
        label="Group by"
        options={(["year", "quarter", "holding"] as const).map((g) => ({ value: g, label: g[0].toUpperCase() + g.slice(1) }))}
        value={groupBy}
        onChange={(v) => setGroupBy(v)}
      />
      <ChipGroup
        label="Show in"
        options={[
          { value: "native", label: "Native currency" },
          { value: "reporting", label: "Reporting currency" },
        ]}
        value={reporting ? "reporting" : "native"}
        onChange={(v) => setReporting(v === "reporting")}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idp}-tax-year`} className="text-xs font-semibold text-muted-foreground">Tax year</label>
          <select
            id={`${idp}-tax-year`}
            value={taxYear}
            onChange={(e) => {
              setTaxYear(e.target.value);
              // A tax-year selection supersedes any explicit range.
              if (e.target.value) {
                setFrom("");
                setTo("");
              }
            }}
            className="h-11 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 regular:pointer-fine:h-8 regular:pointer-fine:text-sm"
          >
            <option value="">All years</option>
            {TAX_YEARS.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idp}-from`} className="text-xs font-semibold text-muted-foreground">From</label>
          <Input
            id={`${idp}-from`}
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (e.target.value) setTaxYear("");
            }}
            className="w-[9.5rem]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idp}-to`} className="text-xs font-semibold text-muted-foreground">To</label>
          <Input
            id={`${idp}-to`}
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (e.target.value) setTaxYear("");
            }}
            className="w-[9.5rem]"
          />
        </div>
        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>
    </>
  );

  return (
    <div className="space-y-4 regular:space-y-6">
      <PageHeader
        backHref="/portfolio"
        backLabel="Back to portfolio"
        title="Dividend income"
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
            <a
              href={csvHref}
              className={`${buttonVariants({ variant: "outline", size: "sm" })} ${HEADER_DESKTOP_ONLY}`}
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </a>
          </>
        }
        overflow={[{ label: "Export CSV", icon: Download, onSelect: () => window.location.assign(csvHref) }]}
      />

      {/* md+ filter toolbar (below md the same fields live in ReportFilterSheet). */}
      <FromMd className="flex flex-wrap gap-x-8 gap-y-4 rounded-xl border border-border/50 bg-card p-4">
        {filterFields("toolbar")}
      </FromMd>
      <ReportFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filter dividends">
        {filterFields("sheet")}
      </ReportFilterSheet>

      {!loading && data && data.totals.rowCount > 0 && <MetricGrid metrics={summaryMetrics} />}

      {reporting && data && (data.totals.unratedCount ?? 0) > 0 && (
        <p className="text-xs text-warning">
          Re-rating in progress: {data.totals.unratedCount} row
          {data.totals.unratedCount === 1 ? "" : "s"} not yet converted to{" "}
          {reportingCcy} and excluded from the totals. Reload shortly.
        </p>
      )}

      <section aria-label="Dividend groups" className="space-y-2">
        {loading ? (
          <PageSkeleton variant="list" rows={3} />
        ) : loadError ? (
          <ErrorState title="Couldn't load dividends" message="We couldn't load your dividend income. Please try again." onRetry={() => setReloadKey((k) => k + 1)} />
        ) : !data || !data.groups || data.groups.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No dividend income yet"
            description='Tag dividend payouts with a category named "Dividends" for them to show up here.'
            action={{ label: "Record a dividend", href: "/portfolio/new?op=income-expense" }}
          />
        ) : (
          <>
            <CompactOnly>
              <SectionCard label={firstHeader} padded={false} className="divide-y divide-border/50 px-3">
                {data.groups.map((g) => (
                  <ListRow
                    key={g.bucket}
                    title={g.label}
                    subtitle={`${g.rowCount} row${g.rowCount === 1 ? "" : "s"} · ${g.reinvestedCount} reinvested · ${g.withholdingCount} withholding`}
                    value={groupAmounts(g)}
                    onPress={() => setOpenGroup(g)}
                    aria-label={`${g.label}, ${g.rowCount} dividend rows`}
                  />
                ))}
              </SectionCard>
            </CompactOnly>

            <FromMd>
              <Table containerClassName="max-h-[70dvh] overflow-y-auto rounded-xl border border-border/50">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>{firstHeader}</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">Reinvested</TableHead>
                    <TableHead className="text-right">Withholding</TableHead>
                    {reporting ? (
                      <TableHead className="text-right">Total ({reportingCcy})</TableHead>
                    ) : (
                      currencyColumns.map((c) => (
                        <TableHead key={c} className="text-right">
                          {c}
                        </TableHead>
                      ))
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.groups.map((g) => (
                    <TableRow key={g.bucket}>
                      <TableCell>{g.label}</TableCell>
                      <TableCell className="text-right">{g.rowCount}</TableCell>
                      <TableCell className="text-right">{g.reinvestedCount}</TableCell>
                      <TableCell className="text-right">{g.withholdingCount}</TableCell>
                      {reporting ? (
                        <TableCell className="text-right">
                          <Amount value={g.amount} currency={reportingCcy} size="md" tone="auto" showSign className="font-mono" />
                        </TableCell>
                      ) : (
                        currencyColumns.map((c) => {
                          const cell = g.byCurrency?.[c];
                          return (
                            <TableCell key={c} className="text-right">
                              {cell ? (
                                <Amount value={cell.amount} currency={c} size="md" tone="auto" showSign className="font-mono" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          );
                        })
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </FromMd>
          </>
        )}
      </section>

      {openGroup && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpenGroup(null)}
          title={openGroup.label}
          description={`${firstHeader} · ${reporting ? reportingCcy : "native currency"}`}
          items={groupDetailItems(openGroup, reporting, reportingCcy, currencyColumns)}
        />
      )}
    </div>
  );
}

/** Fields a dividend group row leaves out: counts and each currency's amount. */
function groupDetailItems(g: GroupRow, reporting: boolean, reportingCcy: string, currencies: string[]): DetailItem[] {
  const items: DetailItem[] = [
    { label: "Dividend rows", value: g.rowCount },
    { label: "Reinvested", value: g.reinvestedCount },
    { label: "Withholding", value: g.withholdingCount },
  ];
  if (reporting) {
    items.push({ label: `Total (${reportingCcy})`, value: <Amount value={g.amount} currency={reportingCcy} size="md" tone="auto" showSign /> });
  } else {
    for (const c of currencies) {
      const cell = g.byCurrency?.[c];
      items.push({
        label: `Total (${c})`,
        value: cell ? <Amount value={cell.amount} currency={c} size="md" tone="auto" showSign /> : "—",
      });
    }
  }
  return items;
}
