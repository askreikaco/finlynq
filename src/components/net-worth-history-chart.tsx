"use client";

/**
 * NetWorthHistoryChart — accurate daily "Net Worth Over Time" (dashboard) and
 * per-account "Balance Over Time" (account detail).
 *
 * Reads /api/net-worth-history (cash computed live from transactions +
 * investments from stored snapshots, latest point = live holdings so it
 * matches the dashboard hero). Period picker (6M / 1Y / ALL) mirrors the
 * PerformanceChart pattern; the area-chart markup reuses NetWorthChart's
 * gradient + axes.
 *
 * plan/net-worth-over-time.md Part A.
 */

import { TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { RebuildSnapshotsButton } from "@/components/portfolio/rebuild-snapshots-button";
import { prepareTimeSeries } from "@/lib/chart-series";
import { Chart } from "@/components/chart";
import { buildStackedSeries, type StackPoint } from "@/lib/chart-stack";
import type { BreakdownMember, BreakdownRow } from "@/lib/chart-breakdown";
import { getDisplayLocale } from "@/lib/locale";
import { useAnimations } from "@/hooks/use-animations";
import { InfoTip } from "@/components/ui/info-tip";
import { dateTick } from "@/lib/chart-format";

export type Period = "6m" | "1y" | "all";

interface NetWorthPoint {
  date: string;
  value: number;
  /** Per-account top-10 (+ "Other") breakdown, pre-ranked by the API (FINLYNQ-128). */
  breakdown?: BreakdownRow[];
  /** FULL per-account members (with ids) for the stacked "By account" view (FINLYNQ-129). */
  members?: BreakdownMember[];
}

/** FINLYNQ-303 — which currency the series is expressed in. */
type Basis = "reporting" | "native";

interface ApiResponse {
  displayCurrency: string;
  period: Period;
  accountId: number | null;
  series: NetWorthPoint[];
  hasInvestmentData: boolean;
  fxApproximation: boolean;
  /**
   * FINLYNQ-303 — the basis the series is ACTUALLY in, and the currency
   * `series[].value` is denominated in. A native request downgrades to
   * reporting when the stored rows predate the dual-basis rebuild, so the
   * chart labels from these and never from what it asked for. Optional so a
   * cached/older API response still renders.
   */
  basisUsed?: Basis;
  seriesCurrency?: string;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "all", label: "ALL" },
];

function fmtFullDate(d: string): string {
  return formatDate(d);
}

export interface NetWorthHistoryChartProps {
  /** Restrict to one account; null/undefined = whole net worth. */
  accountId?: number | null;
  title?: string;
  /**
   * The account's own currency (FINLYNQ-303). Supplying it alongside
   * `accountId` enables the native/reporting toggle — but only when it differs
   * from the user's display currency, since an identical pair makes the two
   * bases the same series. Omit for the whole-portfolio chart, which spans
   * currencies and has no native basis.
   */
  accountCurrency?: string | null;
}

export function NetWorthHistoryChart({
  accountId,
  title = "Net Worth Over Time",
  accountCurrency,
}: NetWorthHistoryChartProps) {
  const displayCurrencyHook = useDisplayCurrency();
  const [period, setPeriod] = useState<Period>("6m");
  // FINLYNQ-303 — session-only (resets on reload), mirroring the period +
  // stacked toggles. Per-account charts default to NATIVE so the line ties out
  // with the account currency Balance tile directly above it; the
  // whole-portfolio chart has no native basis and is pinned to reporting.
  const [basis, setBasis] = useState<Basis>(
    accountId != null ? "native" : "reporting",
  );
  // FINLYNQ-129 — component-only stacked-member toggle (resets on reload). The
  // per-account "By account" stack is hidden for single-account (balance) charts.
  const [stacked, setStacked] = useState(false);
  const stackable = accountId == null;

  // Cache-first (same SWR key as any other reader of this URL): a remounted page paints the last chart at once and
  // revalidates in the background; the Refresh button revalidates it with the rest of the page.
  const params = new URLSearchParams();
  params.set("period", period);
  if (accountId != null) params.set("accountId", String(accountId));
  // Only ever ask for native on a single-account chart — the route rejects it
  // otherwise, since a cross-account total has no native currency.
  if (accountId != null && basis === "native") params.set("basis", "native");
  const res = useCacheFirstJson<ApiResponse>(`/api/net-worth-history?${params.toString()}`);
  const data: ApiResponse | null = res.data ?? null;
  const loading = res.loading;
  const error = res.error;

  // Label from what the API actually returned, never from the requested basis:
  // a native request silently downgrades when the stored rows predate the
  // dual-basis rebuild, and mislabelling that would misstate the currency.
  const currency = data?.seriesCurrency ?? data?.displayCurrency ?? displayCurrencyHook.displayCurrency;
  // The toggle is pointless when both bases resolve to the same currency.
  const canToggleBasis =
    accountId != null &&
    !!accountCurrency &&
    !!data?.displayCurrency &&
    accountCurrency.toUpperCase() !== data.displayCurrency.toUpperCase();
  const rawSeries = useMemo(() => data?.series ?? [], [data]);
  const { data: series, domain, spansZero } = useMemo(
    () =>
      prepareTimeSeries(rawSeries, {
        dateKey: "date",
        valueKeys: ["value"],
        maxPoints: 200,
      }),
    [rawSeries],
  );
  const hasAnyValue = useMemo(() => series.some((p) => p.value !== 0), [series]);

  // FINLYNQ-129 — build the per-account stacked series from the SAME downsampled
  // points the aggregate chart plots, so toggling never shifts the X grid. The
  // outer stack boundary equals `value` at every point (residual = total − top10).
  const { rows: stackedRows, legend } = useMemo(
    () =>
      buildStackedSeries(
        series.map(
          (p): StackPoint => ({
            date: p.date,
            total: p.value,
            members: p.members ?? [],
          }),
        ),
        // FINLYNQ-187 — sign-split so liability accounts (negative per-account
        // contribution) stack BELOW the zero axis; the reconciled net (top of
        // positive stack − bottom of negative stack) still equals `value`.
        { maxMembers: 10, signSplit: true },
      ),
    [series],
  );
  const showStacked = stackable && stacked && legend.length > 0;

  return (
    <Card className="card-hover">
      <CardHeader className="pb-1 px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle icon={TrendingUp} tone="indigo">{title}</CardTitle>
            <p className="text-xs text-muted-foreground">{currency}</p>
          </div>
          <div className="flex items-center gap-1">
            {stackable && (
              <Button
                size="sm"
                variant={stacked ? "default" : "outline"}
                onClick={() => setStacked((s) => !s)}
                title="Break the total into a stacked top-10 view by account"
              >
                By account
              </Button>
            )}
            {canToggleBasis && (
              <>
                <Button
                  size="sm"
                  variant={basis === "native" ? "default" : "outline"}
                  onClick={() => setBasis("native")}
                  title={`Show this balance in the account's own currency (${accountCurrency})`}
                >
                  {accountCurrency}
                </Button>
                <Button
                  size="sm"
                  variant={basis === "reporting" ? "default" : "outline"}
                  onClick={() => setBasis("reporting")}
                  title={`Show this balance converted to your display currency (${data?.displayCurrency})`}
                >
                  {data?.displayCurrency}
                </Button>
              </>
            )}
            {PERIODS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={period === p.key ? "default" : "outline"}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <p className="text-sm text-muted-foreground py-16 text-center">Loading…</p>
        ) : error || !data ? (
          <p className="text-sm text-muted-foreground py-16 text-center">
            Could not load history. Try again shortly.
          </p>
        ) : !hasAnyValue ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground max-w-sm">
              No history to chart yet.
              <InfoTip
                label="About the history chart"
                text={`Add accounts and transactions to see your${accountId != null ? " balance" : " net worth"} over time. If the chart looks stale or flat, rebuild your balance history.`}
              />
            </p>
            <RebuildSnapshotsButton onDone={res.reload} />
          </div>
        ) : (
          <>
            {showStacked ? (
              // FINLYNQ-187: sign-split stacks put liability accounts below the axis, so the zero line is always drawn.
              <Chart
                kind="stacked-area"
                data={stackedRows}
                series={legend}
                xKey="date"
                height={260}
                currency={currency}
                formatX={(d) => dateTick(d, period === "all")}
                formatLabel={fmtFullDate}
                tooltipTotal
                tooltipWide
                zeroLine
                legend
              />
            ) : (
              <Chart
                kind="area"
                data={series}
                xKey="date"
                height={260}
                currency={currency}
                series={[{ key: "value", name: accountId != null ? "Balance" : "Net Worth", strokeWidth: 2.5, breakdownKey: accountId == null ? "breakdown" : undefined }]}
                breakdownHeading="By account"
                formatX={(d) => dateTick(d, period === "all")}
                formatLabel={fmtFullDate}
                yDomain={domain}
                zeroLine={spansZero}
              />
            )}
            {!data.hasInvestmentData && accountId == null && (
              <p className="text-xs text-muted-foreground mt-2">
                Cash &amp; liabilities only — no investment snapshots found.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
