"use client";

/**
 * Internal parts of Chart (not exported from the package index): colour resolution, the CSP-safe swatch, the one
 * tooltip body, the legend row and the container-width hook. No inline style= reaches the HTML: colours are set
 * through ref callbacks after the browser has evaluated the CSP (FINLYNQ-83).
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { CHART_COLORS } from "@/lib/chart-colors";
import { STATUS_DOT } from "@/lib/status-colour";
import type { BreakdownRow } from "@/lib/chart-breakdown";
import type { ChartProps, ChartSeries, ChartTone } from "./types";

export const PALETTE = CHART_COLORS.categories;

/** Tone -> Tailwind classes (progress bars) and CSS variable (SVG). Existing theme tokens only. */
export const TONE_FILL: Record<ChartTone, string> = {
  primary: "bg-primary",
  pos: "bg-pos",
  warning: "bg-warning",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground",
};
export const TONE_TRACK: Record<ChartTone, string> = {
  primary: "bg-primary/10",
  pos: "bg-pos/10",
  warning: "bg-warning/10",
  destructive: "bg-destructive/10",
  neutral: "bg-muted",
};
export const TONE_VAR: Record<ChartTone, string> = {
  primary: "var(--primary)",
  pos: "var(--pos)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  neutral: "var(--muted-foreground)",
};

/** The single colour of a chart / bar: explicit colour, else status colour, else tone, else the fallback. */
export function resolveColor(p: Pick<ChartProps, "color" | "tone" | "status">, fallback: string): string {
  if (p.color) return p.color;
  if (p.status) return STATUS_DOT[p.status];
  if (p.tone) return TONE_VAR[p.tone];
  return fallback;
}

/** SVG paints do not take var() reliably: the same tones as palette hex values (sparkline status / tone colours). */
const TONE_HEX: Record<ChartTone, string> = {
  primary: CHART_COLORS.neutral,
  pos: CHART_COLORS.positive,
  warning: "#f59e0b",
  destructive: CHART_COLORS.negative,
  neutral: "#94a3b8",
};
const STATUS_TONE = { active: "primary", completed: "pos", overdue: "destructive", paused: "neutral" } as const;

export function resolveSvgColor(p: Pick<ChartProps, "color" | "tone" | "status">, fallback: string): string {
  if (p.color) return p.color;
  if (p.status) return TONE_HEX[STATUS_TONE[p.status]];
  if (p.tone) return TONE_HEX[p.tone];
  return fallback;
}

export function seriesColor(s: ChartSeries, index: number): string {
  return s.color ?? PALETTE[index % PALETTE.length];
}

/** Ref callback that paints `color` onto an element's background (no style attribute in the HTML). */
export function paint(color: string | undefined) {
  return (el: HTMLElement | null) => {
    if (el && color) el.style.background = color;
  };
}

export function Swatch({ color, square, className }: { color: string; square?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0", square ? "h-2.5 w-2.5 rounded-[3px]" : "h-2 w-2 rounded-full", className)}
      ref={paint(color)}
    />
  );
}

/** Width of the chart's own container (the pane or phone it sits in), so charts adapt without a viewport query. */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return width;
}

export function useChartRef() {
  return useRef<HTMLDivElement>(null);
}

export function defaultFormatter(currency: string, formatValue?: (v: number) => string) {
  return formatValue ?? ((v: number) => formatCurrency(v, currency));
}

// ── Legend ──────────────────────────────────────────────────────────

export function ChartLegend({ items, square }: { items: { key: string; name: string; color: string }[]; square?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5" data-slot="chart-legend">
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Swatch color={it.color} square={square} />
          <span className="max-w-[160px] truncate" title={it.name}>{it.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── Tooltip ─────────────────────────────────────────────────────────

export interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipOptions {
  series: ChartSeries[];
  stacked: boolean;
  formatValue: (v: number) => string;
  formatLabel?: (label: string) => string;
  total?: boolean;
  wide?: boolean;
  breakdownHeading?: string;
  renderTooltip?: (row: never) => React.ReactNode;
  /** One dotted row per series even when there is just one (the sparkline). */
  dotted?: boolean;
}

/** The ranked "top-N" list under a tooltip row. Height-capped and scrollable unless `uncapped`. */
function BreakdownList({ rows, formatValue, heading, uncapped, wide }: { rows: BreakdownRow[] | undefined; formatValue: (v: number) => string; heading?: string; uncapped?: boolean; wide?: boolean }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border/40 pt-2">
      {heading && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{heading}</p>}
      <div className={uncapped ? "space-y-0.5 pr-1" : "max-h-40 space-y-0.5 overflow-y-auto pr-1"}>
        {rows.map((r, i) => (
          <div key={`${r.name}-${i}`} className="flex items-center gap-3 text-xs">
            {r.color != null && <Swatch color={r.color} />}
            <span className={wide ? "text-muted-foreground" : "max-w-[140px] truncate text-muted-foreground"} title={r.name}>{r.name}</span>
            <span className="ml-auto whitespace-nowrap font-medium tabular-nums">{formatValue(Number(r.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The ONE chart tooltip: date/label heading, value row(s), optional total and per-series breakdown list. */
export function ChartTooltip({
  active,
  payload,
  label,
  series,
  stacked,
  formatValue,
  formatLabel,
  total,
  wide,
  breakdownHeading,
  renderTooltip,
  dotted,
}: ChartTooltipOptions & { active?: boolean; payload?: TooltipEntry[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const heading = label != null && label !== "" ? (formatLabel ? formatLabel(String(label)) : String(label)) : "";
  const frame = cn(
    "rounded-xl border border-border/50 bg-card/95 px-3.5 py-2.5 shadow-lg backdrop-blur-sm",
    wide ? "max-w-[320px]" : "max-w-[260px]",
  );

  if (renderTooltip && row) {
    return <div className={frame}>{renderTooltip(row as never)}</div>;
  }

  const byKey = new Map<string, TooltipEntry>();
  for (const e of payload) if (e.dataKey != null) byKey.set(String(e.dataKey), e);

  // Stacked: rows mirror the visual stack (largest band at the bottom), zero bands dropped.
  let rows: { key: string; name: string; color: string; value: number }[];
  if (stacked) {
    rows = [...series]
      .reverse()
      .map((s, i) => ({ key: s.key, name: s.name ?? s.key, color: seriesColor(s, series.length - 1 - i), value: Number(byKey.get(s.key)?.value) || 0 }))
      .filter((r) => r.value !== 0);
  } else {
    rows = payload.map((e, i) => {
      const s = series.find((x) => x.key === String(e.dataKey));
      return { key: String(e.dataKey ?? i), name: s?.name ?? (e.name != null ? String(e.name) : String(e.dataKey ?? "")), color: e.color ?? PALETTE[i % PALETTE.length], value: Number(e.value) };
    });
  }
  const sum = rows.reduce((a, r) => a + r.value, 0);
  const single = rows.length === 1 && !stacked && !dotted;

  return (
    <div className={frame}>
      {heading && <p className="mb-1 text-xs font-medium text-muted-foreground">{heading}</p>}
      {stacked && total && <p className="text-sm font-semibold tabular-nums">{formatValue(sum)}</p>}
      {!stacked &&
        rows.map((r) => {
          const s = series.find((x) => x.key === r.key);
          const breakdown = s?.breakdownKey && row ? (row[s.breakdownKey] as BreakdownRow[] | undefined) : undefined;
          return (
            <div key={r.key}>
              {single ? (
                <p className="text-sm font-semibold tabular-nums">{formatValue(r.value)}</p>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <Swatch color={r.color} />
                  <span className="text-xs text-muted-foreground">{r.name}</span>
                  <span className="ml-auto text-xs font-semibold tabular-nums">{formatValue(r.value)}</span>
                </div>
              )}
              <BreakdownList rows={breakdown} formatValue={formatValue} heading={breakdownHeading} />
            </div>
          );
        })}
      {stacked && (
        <BreakdownList
          rows={rows.map((r) => ({ name: r.name, value: r.value, color: r.color }))}
          formatValue={formatValue}
          uncapped
          wide={wide}
        />
      )}
    </div>
  );
}
