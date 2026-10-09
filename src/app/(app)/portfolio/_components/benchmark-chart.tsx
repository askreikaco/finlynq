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

import { LineChart, Line, XAxis, YAxis, Legend, ResponsiveContainer, Tooltip } from "recharts";
import { formatDate } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ColorDot } from "@/components/csp-safe-bar";
import { GlassTooltip } from "./portfolio-ui";
import type { BenchmarkData } from "../_types";
import { prepareTimeSeries } from "@/lib/chart-series";
import { formatDateNames } from "@/lib/locale";
import { formatPercent } from "@/lib/locale";
import { useAnimations } from "@/hooks/use-animations";

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
  const animationsEnabled = useAnimations();
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Performance vs Benchmarks</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Compare major indices over time (% change)
            </p>
          </div>
          <div className="flex gap-1">
            {(["ytd", "1y", "3y", "5y"] as const).map(p => (
              <Button
                key={p}
                variant={benchmarkPeriod === p ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setBenchmarkPeriod(p)}
              >
                {p.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {benchmarkLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : benchmarks.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={benchmarkChartData}>
                <XAxis
                  dataKey="date"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => {
                    const d = new Date(v + "T00:00:00");
                    return formatDateNames(d, { month: "short", year: "2-digit" });
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`}
                  domain={domain}
                />
                <Tooltip
                  content={<GlassTooltip formatter={(v) => `${Number(v) > 0 ? "+" : ""}${formatPercent(Number(v), 2)}`} />}
                  labelFormatter={label => {
                    return formatDate(String(label));
                  }}
                />
                <Legend />
                {benchmarks.map(b => (
                  <Line
                    key={b.symbol}
                    type="monotone"
                    dataKey={b.name}
                    stroke={b.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={animationsEnabled}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {benchmarks.map(b => (
                <div key={b.symbol} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <ColorDot color={b.color} className="h-2.5 w-2.5" />
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
      </CardContent>
    </Card>
  );
}
