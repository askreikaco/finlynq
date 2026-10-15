"use client";

/**
 * Performance-vs-Benchmarks sub-surface (FINLYNQ-118 Phase 3, dev-only).
 *
 * Extracted verbatim from portfolio/page.tsx. The benchmark data + period
 * are owned by the page (the `useBenchmarks(period, devMode)` hook lives
 * there); this component renders the line chart + period chips + the
 * per-benchmark return cards, and owns the pure `buildBenchmarkChartData`
 * date-merge helper.
 */

import { BarChart3 } from "lucide-react";
import { Chart } from "@/components/chart";
import { metricGridClass } from "@/components/mobile/metric-grid";
import { formatDate } from "@/lib/currency";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BenchmarkData } from "../_types";
import { prepareTimeSeries } from "@/lib/chart-series";
import { formatDateNames } from "@/lib/locale";
import { formatPercent } from "@/lib/locale";

// ── Helper ──────────────────────────────────────────────────────────
export function buildBenchmarkChartData(benchmarks: BenchmarkData[]): Record<string, unknown>[] {
  if (benchmarks.length === 0) return [];
  const dateMap = new Map<string, Record<string, unknown>>();
  for (const b of benchmarks) {
    for (const pt of b.series) {
      if (!dateMap.has(pt.date)) dateMap.set(pt.date, { date: pt.date });
      dateMap.get(pt.date)![b.name] = pt.value;
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    String(a.date ?? "").localeCompare(String(b.date ?? ""))
  );
}

export function BenchmarkChart({
  benchmarks,
  benchmarkLoading,
  benchmarkPeriod,
  setBenchmarkPeriod,
}: {
  benchmarks: BenchmarkData[];
  benchmarkLoading: boolean;
  benchmarkPeriod: string;
  setBenchmarkPeriod: (p: string) => void;
}) {
  const rawBenchmarkChartData = buildBenchmarkChartData(benchmarks);
  const valueKeys = benchmarks.map((b) => b.name) as (keyof (typeof rawBenchmarkChartData)[number])[];
  const { data: benchmarkChartData, domain } = prepareTimeSeries(
    rawBenchmarkChartData as Record<string, unknown>[],
    {
      dateKey: "date",
      valueKeys: valueKeys as (keyof Record<string, unknown>)[],
      maxPoints: 200,
      // percentages can legitimately go negative
      clampZeroFloor: false,
    },
  );
  return (
    <Card
      title="Performance vs Benchmarks"
      icon={BarChart3}
      tone="violet"
      info="Compare major indices over time (% change)"
      action={<div className="flex gap-1">
            {(["ytd", "1y", "3y", "5y"] as const).map(p => (
              <Button
                key={p}
                variant={benchmarkPeriod === p ? "primary" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setBenchmarkPeriod(p)}
              >
                {p.toUpperCase()}
              </Button>
            ))}
          </div>}
    >
      {benchmarkLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : benchmarks.length > 0 ? (
        <>
          <Chart
            kind="line"
            data={benchmarkChartData}
            xKey="date"
            height={280}
            series={benchmarks.map((b) => ({
              key: b.name,
              name: b.name,
              color: b.color,
              connectNulls: true,
            }))}
            yDomain={domain}
            formatX={(v) => formatDateNames(new Date(v + "T00:00:00"), { month: "short", year: "2-digit" })}
            formatY={(v) => `${v > 0 ? "+" : ""}${v}%`}
            formatValue={(v) => `${v > 0 ? "+" : ""}${formatPercent(v, 2)}`}
            formatLabel={formatDate}
          />
          <div className={`mt-4 ${metricGridClass(benchmarks.length)}`}>
            {benchmarks.map(b => (
              <div key={b.symbol} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                {/* Dot colour set via ref-callback (CSP, FINLYNQ-83) */}
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" ref={(el) => { if (el) el.style.background = b.color; }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">{b.name}</p>
                  <p className={`text-sm font-mono font-semibold ${b.returnPct >= 0 ? "text-pos" : "text-destructive"}`}>
                    {b.returnPct >= 0 ? "+" : ""}{formatPercent(b.returnPct, 2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          Unable to load benchmark data. Try again later.
        </div>
      )}
    </Card>
  );
}
