"use client";

/**
 * MetricCard — the ONE metric / KPI card used across the app (dashboard design):
 * left column: icon + uppercase label, big value, small sub-line with an optional percentage
 * badge, an optional second small line; right column: the chart (optional).
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
import { useAnimations } from "@/hooks/use-animations";
import { useDisplayCurrency } from "@/components/currency-provider";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const noAnimationVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/** Icon tile colours, so pages pick a name instead of hand-writing classes. */
export const METRIC_TONES = {
  indigo: "bg-primary/10 text-primary",
  emerald: "bg-pos/10 text-pos",
  rose: "bg-destructive/10 text-destructive",
  amber: "bg-warning/10 text-warning",
  cyan: "bg-info/10 text-info",
  violet: "bg-chart-5/10 text-chart-5",
  muted: "bg-muted text-muted-foreground",
} as const;
export type MetricTone = keyof typeof METRIC_TONES;

export type MetricCardProps = {
  label: ReactNode;
  icon: LucideIcon;
  /** A METRIC_TONES name, or raw classes for the icon tile. */
  tone?: MetricTone | (string & {});
  /** number = animated currency amount; anything else renders as-is. */
  value: number | ReactNode;
  currency?: string;
  /** Extra classes for the big number (e.g. a green / red tone). */
  valueClassName?: string;
  sub?: ReactNode;
  /** Percentage badge before the sub-line (green ↗ / red ↘); null/undefined = none. */
  badgePct?: number | null;
  /** A second small line under the sub-line. */
  note?: ReactNode;
  /** Shimmer placeholder instead of the number. */
  loading?: boolean;
  sparkData?: number[];
  sparkColor?: string;
  /** Optional "YYYY-MM" labels parallel to sparkData — enables the hover tooltip. */
  sparkLabels?: string[];
  /** Drill-through target; omitted = a static card. */
  href?: string;
  /** Extra content under the sub-line (e.g. a progress bar). */
  children?: ReactNode;
  className?: string;
  /** "hero" = the larger number of the Net Worth card. */
  size?: "default" | "hero";
  onMouseMove?: MouseEventHandler<HTMLDivElement>;
  /** If true, wraps the card in LazyView rendering a skeleton until in viewport */
  lazy?: boolean;
};

export function MetricCard({
  label,
  icon: Icon,
  tone = "muted",
  value,
  currency,
  valueClassName = "",
  sub,
  badgePct,
  note,
  loading = false,
  sparkData,
  sparkColor = "#6366f1",
  sparkLabels,
  href,
  children,
  className = "",
  size = "default",
  onMouseMove,
  lazy = false,
}: MetricCardProps) {
  const animationsEnabled = useAnimations();
  const { displayCurrency } = useDisplayCurrency();
  const resolvedCurrency = currency?.trim() ? currency : displayCurrency;
  const motionVariants = animationsEnabled ? itemVariants : noAnimationVariants;
  const hasSpark = !!sparkData && sparkData.length > 1;
  // Sized by the card's own width so a narrow card (2-up grid on a phone) never clips the number.
  const numberSize = size === "hero" ? "text-3xl @sm:text-4xl @xl:text-5xl" : "text-xl @[13rem]:text-[1.75rem]";
  const toneClasses = tone in METRIC_TONES ? METRIC_TONES[tone as MetricTone] : tone;
  const card = (
    <Card
      className={`@container relative overflow-hidden group card-hover gradient-border hover:scale-[1.005] transition-transform duration-300 h-full${href ? " cursor-pointer" : ""} ${className}`}
      onMouseMove={onMouseMove}
    >
      <div className="@xl:flex @xl:items-stretch @xl:gap-6 h-full">
        <CardContent className={`pt-4 px-5 min-w-0 @xl:flex-1 ${hasSpark ? "pb-0 @xl:pb-4" : "pb-0"}`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-transform duration-300 group-hover:scale-110 ${toneClasses}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase truncate">{label}</p>
          </div>

          {loading ? (
            <span className="inline-block h-7 w-24 animate-shimmer rounded-md align-middle" />
          ) : (
            <div className={`${numberSize} font-bold tracking-tight hero-number tabular-nums leading-none break-words ${valueClassName}`}>
              {typeof value === "number" ? <AnimatedNumber value={value} currency={resolvedCurrency} /> : value}
            </div>
          )}

          <div className="text-[11px] text-muted-foreground mt-1.5 mb-3 space-y-1">
            {loading ? (
              " "
            ) : (
              <>
                {(badgePct != null || sub) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {badgePct != null && <PctBadge pct={badgePct} />}
                    {sub && <span className="min-w-0">{sub}</span>}
                  </div>
                )}
                {note && <div>{note}</div>}
              </>
            )}
          </div>
          {children && <div className="mb-4">{children}</div>}
        </CardContent>

        {hasSpark && (
          <>
            {/* wide card: right-hand column, full height */}
            <div className="hidden @xl:block @xl:w-[40%] @xl:max-w-[18rem] @xl:self-center shrink-0 pr-5 py-5 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
              <LazyView minHeight={96} className="w-full">
                <Sparkline data={sparkData!} color={sparkColor} labels={sparkLabels} currency={resolvedCurrency} height={96} className="w-full sparkline-fade" />
              </LazyView>
            </div>
            {/* narrow card: full-bleed strip along the bottom */}
            <div className="@xl:hidden opacity-50 group-hover:opacity-100 transition-opacity duration-300 -mx-px">
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
    <motion.div variants={motionVariants} className="h-full">
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
      <CardContent className="pt-4 px-5 pb-4 min-w-0">
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
export function PctBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-full ${
        up
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
