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
import { buttonVariants } from "@/components/ui/button";
import { Coins, Download, Receipt, Wallet } from "lucide-react";
import { useDisplayCurrency } from "@/components/currency-provider";
import {
  HEADER_DESKTOP_ONLY,
  Amount,
  DetailSheet,
  ListRow,
  MetricGrid,
  SectionCard,
  type DetailItem,
  type MetricItem,
} from "@/components/mobile";
import { SectionPage } from "@/components/templates/section-page";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { PageToolbar } from "@/components/page-toolbar";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { DIVIDEND_FILTER_KEYS } from "@/lib/toolbar/list-configs";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { cardProps, countByMonth, makeCardResolver, sumByMonth } from "@/lib/metrics/series";
import { NO_HISTORY_CAPTION } from "@/lib/metrics/delta";
import { formatCurrency } from "@/lib/currency";
import { localDateISO } from "@/lib/utils/date";

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

export default function DividendsPage() {
  const { displayCurrency } = useDisplayCurrency();
  // Filters live in the URL and are set on the filter page; the toolbar's range feeds the metric cards.
  const tb = useListToolbar({ filterPath: "/filter/dividends", filterKeys: DIVIDEND_FILTER_KEYS });
  const groupBy: GroupBy = (["year", "quarter", "holding"] as const).find((g) => g === tb.filters.groupBy) ?? "year";
  const reporting = tb.filters.reporting === "1";
  const taxYear = tb.filters.taxYear ?? "";
  // A tax-year selection supersedes any explicit range.
  const from = taxYear ? "" : (tb.filters.from ?? "");
  const to = taxYear ? "" : (tb.filters.to ?? "");
  const [openGroup, setOpenGroup] = useState<GroupRow | null>(null);
  // Cards: this month vs last month by default (or the selected range vs the one before), from every dividend row.
  const metricRange = useMetricRange();
  const rangeArg = useMemo(
    () => ({ selection: metricRange.selection, explicit: metricRange.explicit, period: metricRange.period }),
    [metricRange.selection, metricRange.explicit, metricRange.period],
  );
  const rowsRes = useCacheFirstJson<{ success?: boolean; data?: { rows?: Array<{ date: string; amount: number; currency: string; reportingAmount: number | null; reportingCurrency: string | null }> } }>(
    "/api/portfolio/dividends",
  );
  const divRows = rowsRes.data?.success ? (rowsRes.data.data?.rows ?? null) : null;

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

  // Cache-first: a revisit paints the last grouped dividends / cards at once and revalidates in the background.
  const groupedRes = useCacheFirstJson<ApiResponse>(`/api/portfolio/dividends?${queryParams.toString()}`, { keepPrevious: true });
  const data: ApiResponse["data"] | null = groupedRes.data?.success ? groupedRes.data.data : null;
  const loading = groupedRes.loading;
  const loadError = groupedRes.error || (groupedRes.data !== undefined && !groupedRes.data?.success);
  const reloadGrouped = groupedRes.reload;

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
  const hasFilters = Boolean(from || to);

  const summaryMetrics = useMemo<MetricItem[]>(() => {
    if (!data) return [];
    const items: MetricItem[] = [];
    const through = localDateISO().slice(0, 7);
    const card = (ccy: string) => makeCardResolver(rangeArg, ccy);
    // Period figure (this month by default) with the page's total in the note: the big value, badge and delta share one basis.
    const moneyItem = (label: string, ccy: string, total: number, points: ReturnType<typeof sumByMonth>): MetricItem => {
      const c = card(ccy)(points, "sum");
      return { icon: Wallet,
        label, value: c.value ?? total, currency: ccy, tone: "auto", showSign: true, ...cardProps(c), sub: c.delta ?? NO_HISTORY_CAPTION,
        ...(c.value != null ? { note: `Total in view: ${formatCurrency(total, ccy)}` } : {}),
      };
    };
    if (reporting) {
      const usable = divRows && divRows.length > 0 && divRows.every((r) => r.reportingAmount != null && (r.reportingCurrency ?? reportingCcy).toUpperCase() === reportingCcy.toUpperCase());
      items.push(moneyItem(`Total (${reportingCcy})`, reportingCcy, data.totals.amount, usable ? sumByMonth(divRows, (r) => r.date, (r) => r.reportingAmount ?? 0, through) : []));
    } else {
      for (const [ccy, total] of Object.entries(data.totals.byCurrency)) {
        const mine = divRows ? divRows.filter((r) => r.currency === ccy) : [];
        items.push(moneyItem(`Total (${ccy})`, ccy, total, mine.length > 0 ? sumByMonth(mine, (r) => r.date, (r) => r.amount, through) : []));
      }
    }
    const rowsCard = makeCardResolver(rangeArg)(divRows && divRows.length > 0 ? countByMonth(divRows, (r) => r.date, through) : [], "sum", undefined, "count");
    items.push({
      icon: Receipt, label: "Dividend rows", value: rowsCard.value ?? data.totals.rowCount, ...cardProps(rowsCard), sub: rowsCard.delta ?? NO_HISTORY_CAPTION,
      ...(rowsCard.value != null ? { note: `Total in view: ${data.totals.rowCount}` } : {}),
    });
    return items;
  }, [data, reporting, reportingCcy, divRows, rangeArg]);

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

  return (
    <SectionPage
      id="dividends"
      title="Dividend income"
      info={periodLabel}
      backFallback="/portfolio"
      backLabel="Back to portfolio"
      width="none"
      minW0={false}
      padBottom="none"
      stack="4"
      className="regular:space-y-6"
      header={{
        actions: (
          <>
            <a
              href={csvHref}
              className={`${buttonVariants({ variant: "outline", size: "sm" })} ${HEADER_DESKTOP_ONLY}`}
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </a>
          </>
        ),
        overflow: [{ label: "Export CSV", icon: Download, onSelect: () => window.location.assign(csvHref) }],
        filter: { href: tb.filterHref, activeCount: tb.activeCount },
      }}
    >

      <PageToolbar refresh
        range={{ selection: metricRange.selection, onChange: metricRange.setSelection }}
      />

      {!loading && data && data.totals.rowCount > 0 && (
        <>
          <MetricGrid metrics={summaryMetrics} />
        </>
      )}

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
          <ErrorState title="Couldn't load dividends" message="We couldn't load your dividend income. Please try again." onRetry={reloadGrouped} />
        ) : !data || !data.groups || data.groups.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No dividend income yet"
            description='Tag dividend payouts with a category named "Dividends" for them to show up here.'
            action={{ label: "Record a dividend", href: "/portfolio/new?op=income-expense" }}
          />
        ) : (
          <>
              <SectionCard label={firstHeader} icon={Coins} tone="emerald" list className="px-3">
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
    </SectionPage>
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
