"use client";

/** Donut kind of Chart: ring + optional centre total, tooltip, legend and the ranked breakdown list (with share bars). */

import { useRef } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useDisplayCurrency } from "@/components/currency-provider";
import type { ChartProps, ChartSize } from "./types";
import { ChartLegend, PALETTE, Swatch, useContainerWidth } from "./shared";

const DIAMETER: Record<ChartSize, number> = { xs: 96, "sm": 128, "md": 160, "lg": 192 };

type DonutRow = { key: string; name: string; value: number; color: string; pct: number; disabled: boolean };

export function DonutView(p: ChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(wrapRef);
  const { displayCurrency } = useDisplayCurrency();
  const currency = p.currency?.trim() ? p.currency : displayCurrency;
  const formatValue = p.formatValue ?? ((v: number) => formatCurrency(v, currency));
  const nameKey = p.xKey ?? "name";
  const valueKey = p.valueKey ?? "value";

  const source = (p.data ?? []) as Record<string, unknown>[];
  const total = source.reduce((s, r) => s + (Number(r[valueKey]) || 0), 0);
  const rows: DonutRow[] = source.map((r, i) => {
    const value = Number(r[valueKey]) || 0;
    return {
      key: String(r.key ?? i),
      name: String(r[nameKey] ?? ""),
      value,
      color: typeof r.color === "string" ? r.color : PALETTE[i % PALETTE.length],
      pct: typeof r.pct === "number" ? r.pct : total > 0 ? Math.round((value / total) * 100) : 0,
      disabled: r.disabled === true,
    };
  });

  const base = typeof p.height === "number" ? p.height : DIAMETER[p.size ?? "md"];
  const diameter = width > 0 ? Math.min(base, width) : base;
  const outer = diameter / 2 - 2;
  const inner = outer * 0.62;
  const list = p.breakdownList ?? false;
  const shown = p.breakdownLimit ? rows.slice(0, p.breakdownLimit) : rows;
  const valueMode = p.breakdownValue ?? "pct";
  const interactive = p.tooltip ?? true;

  const valueText = (r: DonutRow) =>
    valueMode === "value" ? formatValue(r.value) : valueMode === "both" ? `${formatValue(r.value)} (${r.pct}%)` : `${r.pct}%`;

  return (
    <div
      ref={wrapRef}
      data-slot="chart"
      data-kind="donut"
      role={p.ariaLabel ? "img" : undefined}
      aria-label={p.ariaLabel}
      className={cn("@container w-full min-w-0", p.className)}
    >
      <div className={cn("flex flex-col items-center gap-4", list && "@md:flex-row @md:items-center @md:gap-6")}>
        <div className="relative shrink-0">
          <PieChart width={diameter} height={diameter}>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={inner}
              outerRadius={outer}
              strokeWidth={2}
              stroke="var(--color-card)"
              paddingAngle={rows.length > 1 ? 2 : 0}
              isAnimationActive={false}
              className={p.onSliceClick ? "cursor-pointer" : undefined}
              onClick={p.onSliceClick ? (_, index) => rows[index] && p.onSliceClick?.(rows[index], index) : undefined}
            >
              {rows.map((r) => (
                <Cell key={r.key} fill={r.color} />
              ))}
            </Pie>
            {interactive && (
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as DonutRow;
                  return (
                    <div className="rounded-xl border border-border/50 bg-card/95 px-3.5 py-2.5 shadow-lg backdrop-blur-sm">
                      <p className="mb-0.5 text-xs font-semibold">{r.name}</p>
                      <p className="text-sm font-bold tabular-nums">{formatValue(r.value)} <span className="text-xs font-normal text-muted-foreground">{r.pct}%</span></p>
                    </div>
                  );
                }}
              />
            )}
          </PieChart>
          {p.center && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {p.center === "total" ? (
                <>
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="max-w-full truncate px-2 text-xs font-bold tabular-nums">{formatValue(total)}</span>
                </>
              ) : (
                p.center
              )}
            </div>
          )}
        </div>

        {list && (
          <div className="w-full min-w-0 flex-1 space-y-3">
            {p.heading}
            <ul className={cn("flex flex-col gap-1.5 text-xs text-muted-foreground", p.breakdownScroll && "max-h-36 overflow-y-auto")}>
              {shown.map((r) => {
                const body = (
                  <>
                    <span className="flex w-full items-center gap-2">
                      <Swatch color={r.color} />
                      {valueMode === "inline" ? (
                        <span className="min-w-0 flex-1 truncate text-left">{r.name} {r.pct}%</span>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate text-left">{r.name}</span>{" "}
                          <span className="whitespace-nowrap font-semibold tabular-nums text-foreground">{valueText(r)}</span>
                        </>
                      )}
                    </span>
                    {p.breakdownBars && (
                      <span className="ml-4 mt-0.5 block h-1 overflow-hidden rounded-full bg-muted/40">
                        <span
                          className="block h-full rounded-full"
                          ref={(el) => {
                            if (el) {
                              el.style.width = `${Math.min(100, Math.max(0, r.pct))}%`;
                              el.style.background = r.color;
                            }
                          }}
                        />
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={r.key} data-slot="chart-breakdown-row">
                    {p.onSliceClick ? (
                      <button
                        type="button"
                        disabled={r.disabled}
                        onClick={() => p.onSliceClick?.(r, rows.indexOf(r))}
                        className="block w-full rounded px-1 py-0.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="py-0.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {p.legend && !list && <ChartLegend items={rows.map((r) => ({ key: r.key, name: r.name, color: r.color }))} />}
    </div>
  );
}

