"use client";

/**
 * PerformanceChart — Phase 3 of plan/portfolio-lots-and-performance.md.
 *
 * Reads /api/portfolio/performance and renders a Recharts line chart of
 * market_value over time, with TWRR / MWRR shown in the header. Period
 * picker drives the query; account picker is the caller's
 * responsibility (this component takes `accountId` as a prop).
 *
 * Empty-state messages distinguish "no snapshots yet" (cron hasn't
 * run / backfill not done) from "no data in this range".
 */

import { TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chart, type ChartSeries } from "@/components/chart";
import { prepareTimeSeries } from "@/lib/chart-series";
import {
  buildStackedSeries,
  type StackPoint,
} from "@/lib/chart-stack";
import { formatPercent } from "@/lib/locale";
import { useDisplayCurrency } from "@/components/currency-provider";

type Period = "1m" | "3m" | "6m" | "ytd" | "1y" | "all";
/** FINLYNQ-172 — stacked grouping mode (was a boolean in FINLYNQ-129). */
type GroupMode = "off" | "holding" | "account";

interface SeriesPoint {
  date: string;
  marketValue: number;
  costBasis: number;
  contribution: number;
  gapsFilled: boolean;
}

/** One sampled grid point of per-holding market value (FINLYNQ-129). */
interface HoldingsPoint {
  date: string;
  total: number;
  members: { id: number; name: string; value: number }[];
}

interface HoldingsApiResponse {
  success: boolean;
  data?: { currency: string; points: HoldingsPoint[] };
}

interface ApiResponse {
  success: boolean;
  data: {
    period: Period;
    accountId: number | null;
    from: string;
    to: string;
    currency: string;
    series: SeriesPoint[];
    twrr: { period: number; annualized: number; hadContributions: boolean };
    mwrr: { irr: number; converged: boolean };
    gapsFilledDays: number;
  };
}

/** Market value + cost basis lines of the Performance card (also the Family overview's). */
export const PERFORMANCE_SERIES: ChartSeries[] = [
  { key: "marketValue", name: "Market value", color: "#06b6d4" },
  { key: "costBasis", name: "Cost basis", color: "#94a3b8", strokeWidth: 1, dashed: true },
];

const PERIODS: Period[] = ["1m", "3m", "6m", "ytd", "1y", "all"];

/** Chip size: 44px tall below md (iOS target), the default sm height at md+; never wraps inside the row. */
const CHIP_CLASS = "shrink-0 whitespace-nowrap pointer-coarse:min-h-11";

export interface PerformanceChartProps {
  /** Restrict the chart to one account; null/undefined = whole portfolio aggregate. */
  accountId?: number | null;
}

export function PerformanceChart({ accountId }: PerformanceChartProps) {
  const { displayCurrency } = useDisplayCurrency();
  const [period, setPeriod] = useState<Period>("1y");
  // FINLYNQ-129/172 — component-only stacked grouping toggle (resets on reload).
  // "holding" = per-holding bands, "account" = per-account bands; both pull from
  // the SAME lazily-fetched endpoint (prices+FX per holding per grid day) via the
  // groupBy param, so only load it once the user opts into a stacked mode.
  const [groupMode, setGroupMode] = useState<GroupMode>("off");
  // "By account" is meaningless when the chart is already scoped to one account
  // (it'd be a single band) — only offer it for the whole-portfolio aggregate (tc-4).
  const canGroupByAccount = accountId == null;

  // Cache-first: a remounted page paints the last chart at once and revalidates in the background.
  const perfParams = new URLSearchParams();
  perfParams.set("period", period);
  if (accountId != null) perfParams.set("accountId", String(accountId));
  const perfRes = useCacheFirstJson<ApiResponse>(`/api/portfolio/performance?${perfParams.toString()}`);
  const data: ApiResponse["data"] | null = perfRes.data?.success ? perfRes.data.data : null;
  const loading = perfRes.loading;

  // If the chart re-scopes to a single account while "By account" is active,
  // that mode no longer makes sense (one band) — fall back to "off" (tc-4).
  useEffect(() => {
    if (!canGroupByAccount && groupMode === "account") setGroupMode("off");
  }, [canGroupByAccount, groupMode]);

  // Lazy member fetch — only when a stacked mode is on. Re-fetches on
  // mode/period/account change so the stack re-ranks (and re-groups) for the
  // new window. groupBy selects per-holding vs per-account bands (FINLYNQ-172).
  const holdParams = new URLSearchParams();
  holdParams.set("period", period);
  holdParams.set("groupBy", groupMode);
  if (accountId != null) holdParams.set("accountId", String(accountId));
  const holdRes = useCacheFirstJson<HoldingsApiResponse>(
    groupMode === "off" ? null : `/api/portfolio/performance/holdings?${holdParams.toString()}`,
  );
  const holdings: { currency: string; points: HoldingsPoint[] } | null =
    groupMode !== "off" && holdRes.data?.success && holdRes.data.data ? holdRes.data.data : null;
  const holdingsLoading = holdRes.loading;

  const rawChartData = useMemo(() => data?.series ?? [], [data]);
  const { data: chartData, domain, spansZero } = useMemo(
    () =>
      prepareTimeSeries(rawChartData, {
        dateKey: "date",
        // contribution is not plotted — exclude from domain computation
        valueKeys: ["marketValue", "costBasis"],
        maxPoints: 200,
      }),
    [rawChartData],
  );

  const stackCurrency = holdings?.currency ?? data?.currency ?? displayCurrency;
  const { rows: stackedRows, legend } = useMemo(
    () =>
      buildStackedSeries(
        (holdings?.points ?? []).map(
          (p): StackPoint => ({ date: p.date, total: p.total, members: p.members }),
        ),
        { maxMembers: 10 },
      ),
    [holdings],
  );
  const stacked = groupMode !== "off";
  const showStacked = stacked && legend.length > 0;
  const axisGroupLabel = groupMode === "account" ? "account" : "holding";

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-2 regular:flex-row regular:items-center regular:justify-between regular:gap-3">
          <CardTitle icon={TrendingUp} tone="emerald">Performance</CardTitle>
          {/* One chip row. Phones: horizontal scroll inside the card (overscroll-x-contain keeps the
              page from scrolling sideways); md+: wraps like before. Chips are 44px tall on phones. */}
          <div
            role="group"
            aria-label="Performance controls"
            className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] regular:flex-wrap regular:overflow-visible regular:pb-0"
          >
            <Button
              size="sm"
              variant={groupMode === "holding" ? "default" : "outline"}
              onClick={() => setGroupMode((m) => (m === "holding" ? "off" : "holding"))}
              title="Stack per-holding market value (dollar axis)"
              className={CHIP_CLASS}
            >
              By holding (value)
            </Button>
            {canGroupByAccount && (
              <Button
                size="sm"
                variant={groupMode === "account" ? "default" : "outline"}
                onClick={() => setGroupMode((m) => (m === "account" ? "off" : "account"))}
                title="Stack per-account market value (dollar axis)"
                className={CHIP_CLASS}
              >
                By account
              </Button>
            )}
            {PERIODS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => setPeriod(p)}
                className={CHIP_CLASS}
              >
                {p.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No snapshots yet. The nightly cron starts populating data on first run;
            for historical fill, run scripts/backfill-portfolio-snapshots.ts.
          </p>
        ) : (
          <>
            <PerformanceBadges twrr={data.twrr} mwrr={data.mwrr} gapsFilledDays={data.gapsFilledDays} />
            {/* Axis-unit label — flips from the TWRR/value line to a per-holding
                dollar stack in stacked mode (tc-2: "y-axis switches to $"). */}
            <p className="text-xs text-muted-foreground mb-1">
              {showStacked
                ? `Market value by ${axisGroupLabel} (${stackCurrency})`
                : `Market value (${data.currency})`}
            </p>
            {showStacked ? (
              <Chart kind="stacked-area" data={stackedRows} series={legend} height={288} currency={stackCurrency} tooltipWide legend />
            ) : (
              <Chart kind="line" data={chartData} height={288} currency={data.currency} series={PERFORMANCE_SERIES} yDomain={domain} zeroLine={spansZero} />
            )}
            {stacked && holdingsLoading && (
              <p className="text-xs text-muted-foreground mt-2">Loading per-holding values…</p>
            )}
            {stacked && !holdingsLoading && legend.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                No per-holding values to stack for this range.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const fmtPct = (v: number | null) =>
  v == null || !Number.isFinite(v) ? "—" : `${formatPercent(v * 100, 2)}`;

/** TWRR / MWRR / incomplete-history badges of the Performance card (shared with Family Wealth). */
export function PerformanceBadges({
  twrr,
  mwrr,
  gapsFilledDays,
}: {
  twrr: { period: number | null; annualized: number | null };
  mwrr: { irr: number | null; converged: boolean };
  gapsFilledDays: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <Badge variant="default" className="px-3 py-1">
        TWRR (period): {fmtPct(twrr.period)}
      </Badge>
      <Badge variant="secondary" className="px-3 py-1">
        TWRR (annualized): {fmtPct(twrr.annualized)}
      </Badge>
      {mwrr.converged && (
        <Badge variant="secondary" className="px-3 py-1">
          MWRR (XIRR): {fmtPct(mwrr.irr)}
        </Badge>
      )}
      {gapsFilledDays > 0 && (
        <Badge variant="destructive" className="px-3 py-1">
          Incomplete history: {gapsFilledDays} day{gapsFilledDays === 1 ? "" : "s"} filled
        </Badge>
      )}
    </div>
  );
}
