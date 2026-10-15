"use client";

/**
 * Cartesian kinds of Chart: sparkline, line, area, bar, stacked-bar, stacked-area (and horizontal bars). One recharts
 * ComposedChart draws all of them; `series[].as` mixes a line over bars. No mount animation anywhere (owner rule).
 */

import { useId, useMemo, useRef } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, getMonthLabel } from "@/lib/currency";
import { formatPercent } from "@/lib/locale";
import { formatCompactNumber } from "@/lib/utils/number";
import { cn } from "@/lib/utils";
import { useDisplayCurrency } from "@/components/currency-provider";
import type { ChartProps, ChartSeries } from "./types";
import { ChartLegend, ChartTooltip, PALETTE, resolveSvgColor, seriesColor, useContainerWidth } from "./shared";

/**
 * Padded domain for a sparkline: 10% of the range on each side so tightly clustered values do not look flat.
 * Ignores non-finite values; flat data gets 5% of its magnitude.
 */
export function sparkDomain(data: number[]): [number, number] {
  if (!data || data.length === 0) return [0, 1];
  const finite = data.filter(Number.isFinite);
  if (finite.length === 0) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    const pad = Math.abs(max) * 0.05;
    return [max - pad, max + pad];
  }
  const pad = (max - min) * 0.1;
  return [min - pad, max + pad];
}

const TICK = { fill: "var(--color-muted-foreground)" };

function deltaPct(rows: ReadonlyArray<object>, key: string): number | null {
  const vals = rows.map((r) => (r as Record<string, unknown>)[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vals.length < 2 || vals[0] === 0) return null;
  return ((vals[vals.length - 1] - vals[0]) / Math.abs(vals[0])) * 100;
}

export function CartesianView(p: ChartProps) {
  const uid = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(wrapRef);
  const narrow = width > 0 && width < 320;
  const { displayCurrency } = useDisplayCurrency();
  const currency = p.currency?.trim() ? p.currency : displayCurrency;
  const formatValue = p.formatValue ?? ((v: number) => formatCurrency(v, currency));

  const spark = p.kind === "sparkline";
  const stacked = p.kind === "stacked-bar" || p.kind === "stacked-area";
  const baseAs: NonNullable<ChartSeries["as"]> = p.kind === "line" ? "line" : p.kind === "bar" || p.kind === "stacked-bar" ? "bar" : "area";
  const horizontal = !!p.horizontal;
  const xKey = spark ? "label" : (p.xKey ?? "date");

  const sparkColor = resolveSvgColor(p, PALETTE[0]);
  const rows = useMemo<ReadonlyArray<object>>(
    () => (spark ? (p.values ?? []).map((value, index) => ({ index, value, label: p.labels?.[index] })) : (p.data ?? [])),
    [spark, p.values, p.labels, p.data],
  );
  const series: ChartSeries[] = useMemo(
    () => (spark ? [{ key: "value", color: sparkColor, strokeWidth: 1.5 }] : (p.series ?? [])),
    [spark, sparkColor, p.series],
  );

  const axesX = spark ? false : typeof p.axes === "object" ? (p.axes.x ?? true) : (p.axes ?? true);
  const axesY = spark ? false : typeof p.axes === "object" ? (p.axes.y ?? true) : (p.axes ?? true);
  const interactive = p.tooltip ?? (spark ? Boolean(p.labels?.length) : true);
  const hasBar = series.some((s) => (s.as ?? baseAs) === "bar");
  const fill = p.height === "fill";
  const heightPx: number | `${number}%` = fill ? "100%" : typeof p.height === "number" ? p.height : spark ? 30 : 260;
  const delta = p.delta === true ? deltaPct(rows, series[0]?.key ?? "value") : typeof p.delta === "number" ? p.delta : null;

  const margin = spark
    ? { top: 2, right: 2, bottom: 2, left: 2 }
    : horizontal
      ? { top: 4, right: 8, bottom: 4, left: 0 }
      : axesY
        ? { top: 8, right: 4, bottom: 0, left: -10 }
        : { top: 8, right: 4, bottom: 0, left: 4 };

  const tooltipOpts = {
    series,
    stacked,
    formatValue,
    formatLabel: spark ? (l: string) => getMonthLabel(l) : p.formatLabel,
    total: p.tooltipTotal,
    wide: p.tooltipWide,
    breakdownHeading: p.breakdownHeading,
    renderTooltip: p.renderTooltip,
    dotted: spark,
  };

  const sparkDom = spark ? sparkDomain(p.values ?? []) : undefined;
  const yDomain = spark ? sparkDom : p.yDomain;
  const lineColor = (c: string | undefined) => c ?? "var(--color-muted-foreground)";

  const legendItems = series.filter((s) => s.name).map((s, i) => ({ key: s.key, name: s.name as string, color: seriesColor(s, i) }));

  return (
    <div
      ref={wrapRef}
      data-slot="chart"
      data-kind={p.kind}
      role={p.ariaLabel ? "img" : undefined}
      aria-label={p.ariaLabel}
      className={cn("@container w-full min-w-0", fill && "h-full", p.className)}
    >
      {delta != null && Number.isFinite(delta) && (
        <div className="mb-1 flex justify-end">
          <span data-slot="chart-delta" className={cn("text-xs font-semibold tabular-nums", delta >= 0 ? "text-pos" : "text-destructive")}>
            {delta >= 0 ? "+" : ""}{formatPercent(delta, 1)}
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={heightPx} minWidth={0}>
        <ComposedChart data={rows as object[]} margin={margin} layout={horizontal ? "vertical" : "horizontal"} barSize={horizontal ? 12 : undefined}>
          {p.grid && <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />}
          <defs>
            {series.map((s, i) => {
              const color = seriesColor(s, i);
              const isArea = (s.as ?? baseAs) === "area";
              if (!isArea || !(s.gradient ?? (!stacked && s.fillOpacity == null))) return null;
              return (
                <linearGradient key={s.key} id={`${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={spark ? 0.18 : 0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          {horizontal ? (
            <>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey={xKey} width={p.yWidth ?? 85} fontSize={11} tickLine={false} axisLine={false} tick={TICK} />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                hide={!axesX}
                fontSize={narrow ? 9 : 10}
                tickLine={false}
                axisLine={false}
                minTickGap={narrow ? 32 : 48}
                interval={p.xInterval ?? "preserveStartEnd"}
                tickFormatter={p.formatX ? (v) => p.formatX!(String(v)) : undefined}
                tick={TICK}
                angle={p.xAngle}
                textAnchor={p.xAngle ? "end" : "middle"}
                height={p.xAngle ? 60 : undefined}
              />
              <YAxis
                hide={!axesY}
                fontSize={narrow ? 9 : 10}
                tickLine={false}
                axisLine={false}
                width={p.yWidth ?? (narrow ? 40 : 48)}
                tick={TICK}
                tickFormatter={(v) => (p.formatY ?? formatCompactNumber)(Number(v))}
                domain={yDomain}
              />
            </>
          )}
          {interactive && (
            <Tooltip
              content={<ChartTooltip {...tooltipOpts} />}
              cursor={hasBar ? { fill: "var(--color-muted)", opacity: 0.4 } : { stroke: spark ? sparkColor : "var(--color-border)", strokeOpacity: spark ? 0.35 : 1, strokeDasharray: spark ? undefined : "4 4" }}
              // A 30px sparkline sits at the bottom of an overflow-hidden card: draw the tooltip ABOVE the cursor (escape + reverse on Y).
              {...(spark ? { allowEscapeViewBox: { x: false, y: true }, reverseDirection: { x: false, y: true }, offset: 8, wrapperStyle: { zIndex: 50, pointerEvents: "none" as const } } : {})}
            />
          )}
          {p.zeroLine && <ReferenceLine y={0} stroke="#888" />}
          {p.lines?.map((l, i) => (
            <ReferenceLine
              key={i}
              y={l.y}
              x={l.x}
              stroke={lineColor(l.color)}
              strokeWidth={l.width ?? 1.5}
              strokeDasharray={l.dashed === false ? undefined : "5 4"}
              label={l.label ? { value: l.label, position: l.y != null ? "insideTopRight" : "top", fill: lineColor(l.color), fontSize: 11 } : undefined}
            />
          ))}
          {series.map((s, i) => {
            const as = s.as ?? baseAs;
            const color = seriesColor(s, i);
            const stackId = s.stackId ?? (stacked ? "stack" : undefined);
            const common = { dataKey: s.key, name: s.name, isAnimationActive: false } as const;
            if (as === "bar") {
              const styled = s.colorByRow || s.barStyle;
              return (
                <Bar key={s.key} {...common} stackId={stackId} fill={color} radius={horizontal ? [0, 6, 6, 0] : stacked ? [2, 2, 0, 0] : [4, 4, 0, 0]} maxBarSize={44}>
                  {styled &&
                    rows.map((row, ri) => {
                      const st = s.barStyle?.(row as never, ri);
                      return <Cell key={ri} fill={st?.color ?? (s.colorByRow ? PALETTE[ri % PALETTE.length] : color)} fillOpacity={st?.opacity} />;
                    })}
                </Bar>
              );
            }
            if (as === "line") {
              return (
                <Line
                  key={s.key}
                  {...common}
                  type={s.step ? "stepAfter" : "monotone"}
                  stroke={color}
                  strokeWidth={s.strokeWidth ?? 2}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  dot={s.dots ? { r: 3, fill: color, strokeWidth: 0 } : false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: "var(--color-card)" }}
                  connectNulls={s.connectNulls}
                />
              );
            }
            const gradient = s.gradient ?? (!stacked && s.fillOpacity == null);
            return (
              <Area
                key={s.key}
                {...common}
                type="monotone"
                stackId={stackId}
                stroke={s.strokeWidth === 0 ? "none" : color}
                strokeWidth={s.strokeWidth ?? (stacked ? 1 : spark ? 1.5 : 2)}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                fill={gradient ? `url(#${uid}-${i})` : color}
                fillOpacity={gradient ? undefined : (s.fillOpacity ?? 0.6)}
                dot={s.dots ? { r: 3, fill: color, strokeWidth: 0 } : false}
                activeDot={spark ? (interactive ? { r: 3, stroke: color, strokeWidth: 1, fill: color } : false) : { r: 4, strokeWidth: 2, fill: "var(--color-card)" }}
                connectNulls={s.connectNulls}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
      {p.legend && <ChartLegend items={legendItems} square={stacked} />}
    </div>
  );
}
