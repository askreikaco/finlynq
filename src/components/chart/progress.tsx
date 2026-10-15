"use client";

/**
 * Progress-bar kind of Chart: a thin horizontal bar (paid / used / saved / budget share). The fill width is set
 * through a ref (FINLYNQ-83: CSP only inspects HTML-rendered style attributes). No grow-in on mount.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ChartProps, ChartSize } from "./types";
import { TONE_FILL, TONE_TRACK, resolveColor } from "./shared";

const BAR_HEIGHT: Record<ChartSize, string> = { xs: "h-1", "sm": "h-1.5", "md": "h-2.5", "lg": "h-3" };

export function ProgressView(p: ChartProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const pct = Math.max(0, Math.min(100, Number.isFinite(p.value) ? (p.value as number) : 0));
  const custom = p.color ?? (p.status ? resolveColor(p, "") : undefined);
  const name = p.ariaLabel ?? (typeof p.label === "string" ? p.label : undefined);

  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;
    el.style.width = `${pct}%`;
    if (custom) el.style.background = custom;
  }, [pct, custom]);
  useEffect(() => {
    if (markRef.current && p.target != null) markRef.current.style.left = `${Math.max(0, Math.min(100, p.target))}%`;
  }, [p.target]);

  return (
    <div data-slot="chart" data-kind="progress" data-testid={p.testId} className={cn("w-full min-w-0", p.className)}>
      {(p.label != null || p.valueLabel) && (
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate">{p.label}</span>
          {p.valueLabel && <span className="tabular-nums text-muted-foreground">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role={name ? "progressbar" : undefined}
        aria-label={name}
        aria-valuenow={name ? Math.round(pct) : undefined}
        aria-valuemin={name ? 0 : undefined}
        aria-valuemax={name ? 100 : undefined}
        className={cn("relative w-full overflow-hidden rounded-full", BAR_HEIGHT[p.size ?? "md"], p.trackTone ? TONE_TRACK[p.trackTone] : "bg-muted")}
      >
        <div ref={fillRef} className={cn("h-full rounded-full", !custom && TONE_FILL[p.tone ?? "primary"])} />
        {p.target != null && <div ref={markRef} aria-hidden className="absolute inset-y-0 w-0.5 bg-foreground/60" />}
      </div>
    </div>
  );
}
