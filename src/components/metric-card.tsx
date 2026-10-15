"use client";

/**
 * MetricCard — the ONE metric / KPI card used across the app (dashboard design). Every part is optional
 * and shows only when its prop is given:
 *   label (+ icon tile, tone, `info` tip, `action`) · value (`size="hero"` = larger) · `delta` (% badge vs the
 *   previous period + text) · `sub` / `note` lines · `sparkData` strip · `progress` (bar + % + caption) ·
 *   `href` (whole card is a link) · `children` (free extra content under the lines).
 * Layout: left column: icon + uppercase label, big value, sub-line, optional second line; right column: the chart.
 *
 * The sparkline follows the card's own width (container query): a narrow card shows it as a
 * full-bleed strip along the bottom; a wide card (≥ 36rem, e.g. the Net Worth hero) moves it
 * into a right-hand column at full height.
 *
 * `value` as a number renders an animated currency amount; anything else (a percentage,
 * a count, a badge) renders as-is. Use `valueClassName` for a tone (green / amber / red).
 */

import type { MouseEventHandler, ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { formatPercent } from "@/lib/locale";
import { LazyView } from "@/components/ui/lazy-view";
import { useDisplayCurrency } from "@/components/currency-provider";
import { CardLabel, CARD_PAD_T, CARD_PAD_X, METRIC_TONES, type MetricTone } from "@/components/mobile/card-label";
import { ProgressBar, type ProgressTone } from "@/components/mobile/progress-row";
import { InfoTip } from "@/components/ui/info-tip";
import { formatCurrency } from "@/lib/currency";
import type { AmountTone } from "@/components/mobile/amount";

// No mount animation on metric cards: the variants are inert (hover animation lives in the Card classes).
const itemVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/** Change vs the previous period: `pct` = the green / red badge, `text` = the signed difference line ("+$12 vs last month"). */
export type MetricDelta = {
  /** Percent (already in percent, -0.5 = -0.5%); null / undefined = no badge. */
  pct?: number | null;
  /** Caption after the badge. The card's `sub`, when given, takes its place. */
  text?: ReactNode;
  /** Less is better (debt, spent): up = red, down = green. */
  invert?: boolean;
};

/** Progress part: a thin bar plus a caption under it. `value` 0..100 (clamped); null = empty bar. */
export type MetricProgress = {
  value: number | null;
  tone?: ProgressTone;
  /** Text under the bar; default "<n>%". */
  caption?: ReactNode;
  /** Accessible name of the bar; default = the card label when it is text. */
  ariaLabel?: string;
};

const VALUE_TONE: Record<AmountTone, string> = {
  auto: "",
  pos: "text-pos",
  neg: "text-neg",
  muted: "text-muted-foreground",
  none: "",
};

export { METRIC_TONES };
export type { MetricTone };

export type MetricCardProps = {
  label: ReactNode;
  icon: LucideIcon;
  /** A METRIC_TONES name, or raw classes for the icon tile. */
  tone?: MetricTone | (string & {});
  /** Short help text -> an InfoTip (i) in the label row. */
  info?: ReactNode;
  /** Control on the right of the label row (e.g. an edit button). */
  action?: ReactNode;
  /** number = animated money amount (in `currency`, else the display currency); anything else renders as-is (wrap a plain count in <span>). */
  value: number | ReactNode;
  currency?: string;
  /** Sign colour of a numeric value: "auto" = green > 0 / red < 0. */
  valueTone?: AmountTone;
  /** Prefix "+" on a positive money amount. */
  showSign?: boolean;
  /** Extra classes for the big number (e.g. a green / red tone). */
  valueClassName?: string;
  /** "hero" = the larger number of the Net Worth card. */
  size?: "default" | "hero";
  /** Change vs the previous period (badge + text). */
  delta?: MetricDelta;
  /** One-line caption under the value (a delta `text` or any caption). */
  sub?: ReactNode;
  /** A second small line under the sub-line. */
  note?: ReactNode;
  /** Bar + caption under the lines. */
  progress?: MetricProgress;
  /** Shimmer placeholder instead of the number. */
  loading?: boolean;
  sparkData?: number[];
  sparkColor?: string;
  /** Optional "YYYY-MM" labels parallel to sparkData — enables the hover tooltip. */
  sparkLabels?: string[];
  /** Drill-through target; omitted = a static card. */
  href?: string;
  /** Free extra content under the lines (use `progress` for a bar). */
  children?: ReactNode;
  /** Classes of the card surface (glow, tint). */
  className?: string;
  /** Classes of the grid cell around the card (e.g. `max-regular:hidden`). */
  cellClassName?: string;
  /** Stable id -> data-testid="metric-<id>" and a labelled group on the cell. */
  id?: string;
  ariaLabel?: string;
  onMouseMove?: MouseEventHandler<HTMLDivElement>;
  /** If true, wraps the card in LazyView rendering a skeleton until in viewport */
  lazy?: boolean;
};

export function MetricCard({
  label,
  icon: Icon,
  tone = "muted",
  info,
  action,
  value,
  currency,
  valueTone,
  showSign = false,
  valueClassName = "",
  sub,
  delta,
  note,
  progress,
  loading = false,
  sparkData,
  sparkColor = "#6366f1",
  sparkLabels,
  href,
  children,
  className = "",
  cellClassName,
  id,
  ariaLabel,
  size = "default",
  onMouseMove,
  lazy = false,
}: MetricCardProps) {
  const { displayCurrency } = useDisplayCurrency();
  const resolvedCurrency = currency?.trim() ? currency : displayCurrency;
  const tonePick = valueTone === "auto" && typeof value === "number" ? (value > 0 ? "pos" : value < 0 ? "neg" : "none") : (valueTone ?? "none");
  const valueClass = [VALUE_TONE[tonePick], valueClassName].filter(Boolean).join(" ");
  const shownValue: ReactNode =
    typeof value === "number" ? (
      showSign && value > 0 ? <span>{`+${formatCurrency(value, resolvedCurrency)}`}</span> : <AnimatedNumber value={value} currency={resolvedCurrency} />
    ) : (
      value
    );
  const subText = sub ?? delta?.text;
  const hasLabelExtras = !!info || !!action;
  const hasSpark = !!sparkData && sparkData.length > 1;
  // Sized by the card's own width so a narrow card (2-up grid on a phone) never clips the number.
  // Hero: 5xl only once the number column (card minus the 40% sparkline column) fits "808.924.476 ₫" at 48px (@[42rem]).
  const numberSize = size === "hero" ? "text-3xl @[24rem]:text-4xl @[42rem]:text-5xl" : "text-lg @[11rem]:text-xl @[13rem]:text-2xl @[18rem]:text-3xl";
  const card = (
    <Card
      className={`@container relative overflow-hidden group card-hover gradient-border hover:scale-[1.005] transition-transform duration-300 h-full${href ? " cursor-pointer" : ""} ${className}`}
      onMouseMove={onMouseMove}
    >
      <div className="@[36rem]:flex @[36rem]:items-stretch @[36rem]:gap-6 h-full">
        <CardContent className={`${CARD_PAD_T} ${CARD_PAD_X} min-w-0 ${size === "hero" ? "@[36rem]:flex-none @[36rem]:min-w-[16rem]" : "@[36rem]:flex-1"} ${hasSpark ? "pb-0 @[36rem]:pb-4" : "pb-0"}`}>
          <CardLabel
            inset
            icon={Icon}
            tone={tone}
            tileClassName="transition-transform duration-300 group-hover:scale-110"
            action={
              hasLabelExtras ? (
                // Inside a linked card a click on the tip / action must not navigate.
                <span className="flex items-center gap-1" onClick={href ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}>
                  {info ? <InfoTip text={info} label={typeof label === "string" ? `About ${label}` : undefined} /> : null}
                  {action}
                </span>
              ) : undefined
            }
          >
            {label}
          </CardLabel>

          {loading ? (
            <span className="inline-block h-7 w-24 animate-shimmer rounded-md align-middle" />
          ) : (
            <div className={`${numberSize} font-bold tracking-tight hero-number tabular-nums leading-none ${size === "hero" && typeof value === "number" ? "whitespace-nowrap" : "break-words"} ${valueClass}`}>
              {shownValue}
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-1.5 mb-3 space-y-1">
            {loading ? (
              " "
            ) : (
              <>
                {(delta?.pct != null || subText) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {delta?.pct != null && <PctBadge pct={delta.pct} invert={delta.invert} />}
                    {subText && <span className="min-w-0">{subText}</span>}
                  </div>
                )}
                {note && <div>{note}</div>}
              </>
            )}
          </div>
          {children && <div className="mb-4">{children}</div>}
          {progress && !loading && (
            <div data-slot="metric-progress" className="mb-4 space-y-1.5">
              <ProgressBar
                value={progress.value}
                tone={progress.tone}
                ariaLabel={progress.ariaLabel ?? (typeof label === "string" ? label : "Progress")}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {progress.caption ?? (progress.value == null ? "" : `${Math.round(progress.value)}%`)}
              </p>
            </div>
          )}
        </CardContent>

        {hasSpark && (
          <>
            {/* wide card: right-hand column, full height */}
            <div className={`hidden @[36rem]:block ${size === "hero" ? "@[36rem]:flex-1 @[36rem]:min-w-0" : "@[36rem]:w-[40%] @[36rem]:max-w-[18rem]"} @[36rem]:self-center shrink-0 pr-5 py-5 opacity-60 group-hover:opacity-100 transition-opacity duration-300`}>
              <LazyView minHeight={96} className="w-full">
                <Sparkline data={sparkData!} color={sparkColor} labels={sparkLabels} currency={resolvedCurrency} height={96} className="w-full sparkline-fade" />
              </LazyView>
            </div>
            {/* narrow card: full-bleed strip along the bottom */}
            <div className="@[36rem]:hidden opacity-50 group-hover:opacity-100 transition-opacity duration-300 -mx-px">
              <LazyView minHeight={44} className="w-full">
                <Sparkline data={sparkData!} color={sparkColor} labels={sparkLabels} currency={resolvedCurrency} height={44} />
              </LazyView>
            </div>
          </>
        )}
      </div>
    </Card>
  );

  const content = (
    <motion.div
      variants={itemVariants}
      data-testid={id ? `metric-${id}` : undefined}
      role={id ? "group" : undefined}
      aria-label={id ? (ariaLabel ?? (typeof label === "string" ? label : undefined)) : ariaLabel}
      className={`h-full min-w-0${cellClassName ? ` ${cellClassName}` : ""}`}
    >
      {href ? (
        <Link href={href} className="block h-full">
          {card}
        </Link>
      ) : (
        card
      )}
    </motion.div>
  );

  if (lazy) {
    return (
      <LazyView
        className="h-full"
        placeholder={<MetricCardSkeleton className={className} size={size} />}
      >
        {content}
      </LazyView>
    );
  }

  return content;
}

export function MetricCardSkeleton({
  className = "",
  size = "default",
}: {
  className?: string;
  size?: "default" | "hero";
}) {
  return (
    <Card className={`@container relative overflow-hidden h-full ${className}`}>
      <CardContent className={`${CARD_PAD_T} ${CARD_PAD_X} pb-4 min-w-0`}>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-8 w-8 rounded-lg animate-shimmer shrink-0" />
          <div className="h-3 w-20 animate-shimmer rounded" />
        </div>
        <div
          className={`animate-shimmer rounded mb-3 ${
            size === "hero" ? "h-10 w-48" : "h-7 w-32"
          }`}
        />
        <div className="h-3 w-24 animate-shimmer rounded" />
      </CardContent>
    </Card>
  );
}

/** The green ↗ / red ↘ percentage pill (value already in percent, e.g. -0.5 = -0.5%). */
export function PctBadge({ pct, invert = false }: { pct: number; invert?: boolean }) {
  const up = pct >= 0;
  const good = invert ? !up : up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 @[11rem]:gap-1 text-xs font-semibold px-1.5 @[11rem]:px-2.5 py-0.5 rounded-full ${
        good
          ? "text-pos bg-pos/10"
          : "text-destructive bg-destructive/10"
      }`}
    >
      <Arrow className="h-3 w-3" aria-hidden="true" />
      {up ? "+" : ""}
      {formatPercent(pct, 1)}
    </span>
  );
}
