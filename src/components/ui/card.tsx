"use client";

/**
 * Card — the ONE card of the app (metric tiles, titled sections, plain boxes, divided lists). Every part is
 * optional and shows only when its prop is given; nothing else in the app draws a card surface.
 *
 *   title (+ icon tile, tone, `info` tip, `action`)   titlePlacement "inside" (first row) | "outside" (small heading above the box)
 *   description                                       one visible line, descriptionPlacement "inside" | "outside"
 *   frame   "card" (surface) | "bare" (no surface, outside title only; title aligns with the page edge) | "list" (unpadded, --list-divider between rows)
 *   padded  body padding (default on; ignored by `list`)
 *   metric parts, shown when `value` is given:
 *     value (`size="hero"` = larger) · `valueTone` · `delta` (% badge + text) · `sub` / `note` lines ·
 *     `spark` strip · `progress` bar · `loading` shimmer
 *   href    the whole card is a link
 *   id      (metric cards) also the test id `metric-<id>`
 *
 * Classes: `frameClassName` styles the card surface (tint, border, glow); `className` styles the body.
 * A metric card's sparkline follows the card's own width (container query): a narrow card shows it as a
 * full-bleed strip along the bottom; a wide card (>= 36rem) moves it into a right-hand column.
 * `value` as a number renders an animated currency amount; anything else renders as-is.
 * No mount animation (the hover animation of metric / linked cards lives in the classes below).
 */

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";
import { AnimatedNumber } from "@/components/animated-number";
import { formatPercent } from "@/lib/locale";
import { LazyView } from "@/components/ui/lazy-view";
import { useDisplayCurrency } from "@/components/currency-provider";
import { CardLabel, CARD_PAD_X, type MetricTone } from "@/components/mobile/card-label";
import { ProgressBar, type ProgressTone } from "@/components/mobile/list-row";
import { InfoTip } from "@/components/ui/info-tip";
import { formatCurrency } from "@/lib/currency";
import type { AmountTone } from "@/components/mobile/amount";

const SURFACE = "surface-card min-w-0 rounded-xl border border-border/50 text-card-foreground";
/** Divided rows: the --list-divider inset shadow under every direct child but the last. */
const LIST_DIVIDER = "[&>*:not(:last-child)]:shadow-[var(--list-divider)]";
/** Hover animation of a metric / linked card. */
const INTERACTIVE = "relative group card-hover gradient-border hover:scale-[1.005] transition-transform duration-300";
/** Bottom padding of a metric card's text column. */
const METRIC_PAD_B = "pb-4";

/** Change vs the previous period: `pct` = the green / red badge, `text` = the signed difference line ("+$12 vs last month"). */
export type CardDelta = {
  /** Percent (already in percent, -0.5 = -0.5%); null / undefined = no badge. */
  pct?: number | null;
  /** Caption after the badge. The card's `sub`, when given, takes its place. */
  text?: React.ReactNode;
  /** Less is better (debt, spent): up = red, down = green. */
  invert?: boolean;
};

/** Progress part: a thin bar plus a caption under it. `value` 0..100 (clamped); null = empty bar. */
export type CardProgress = {
  value: number | null;
  tone?: ProgressTone;
  /** Text under the bar; default "<n>%". */
  caption?: React.ReactNode;
  /** Accessible name of the bar; default = the title when it is text. */
  ariaLabel?: string;
};

/** Sparkline strip. `labels` ("YYYY-MM", parallel to `data`) enable the hover tooltip. */
export type CardSpark = { data?: number[] | null; color?: string; labels?: string[] };

const VALUE_TONE: Record<AmountTone, string> = {
  auto: "",
  pos: "text-pos",
  neg: "text-neg",
  muted: "text-muted-foreground",
  none: "",
};

export type CardProps = Omit<React.HTMLAttributes<HTMLElement>, "title" | "children"> & {
  ref?: React.Ref<HTMLElement>;
  /** The card's title. Omit for a plain card. */
  title?: React.ReactNode;
  /** "inside" (default): the title is the card's first row (UPPERCASE). "outside": a small heading above the card box. */
  titlePlacement?: "inside" | "outside";
  /** Extra classes for the title row (e.g. a sticky date header). */
  titleClassName?: string;
  /** Icon tile before the title (inside titles only). */
  icon?: LucideIcon;
  /** METRIC_TONES name (or raw classes) for the icon tile. */
  tone?: MetricTone | (string & {});
  /** Help text -> an (i) InfoTip after the title. Prefer this for explanatory copy. */
  info?: React.ReactNode;
  /** Accessible name of the (i) button. Default "About <title>". */
  infoLabel?: string;
  /** Visible one-line description. Use `info` instead when it is explanatory. */
  description?: React.ReactNode;
  /** Where the description sits. Default: follows `titlePlacement`. */
  descriptionPlacement?: "inside" | "outside";
  /** Control on the right of the title row (e.g. an edit button). */
  action?: React.ReactNode;
  /** "card" (default) = surface; "bare" = no surface (outside title: title and children sit on the page); "list" = divided unpadded rows. */
  frame?: "card" | "bare" | "list";
  /** Body padding. Default true; ignored by frame="list". */
  padded?: boolean;
  /** Classes of the card surface (tint, border, glow, layout). */
  frameClassName?: string;
  /** Classes of the body area. */
  className?: string;
  /** Whole card is a link; omitted = static. */
  href?: string;
  /** number = animated money amount (in `currency`, else the display currency); anything else renders as-is (wrap a plain count in <span>). Starts the metric layout. */
  value?: number | React.ReactNode;
  currency?: string;
  /** Sign colour of a numeric value: "auto" = green > 0 / red < 0. */
  valueTone?: AmountTone;
  /** Prefix "+" on a positive money amount. */
  showSign?: boolean;
  /** Extra classes for the big number. */
  valueClassName?: string;
  /** "hero" = the larger number of the Net Worth card. */
  size?: "default" | "hero";
  /** Change vs the previous period (badge + text). */
  delta?: CardDelta;
  /** One-line caption under the value. */
  sub?: React.ReactNode;
  /** A second small line under the sub-line. */
  note?: React.ReactNode;
  /** Bar + caption under the lines. */
  progress?: CardProgress;
  spark?: CardSpark;
  /** Shimmer placeholder instead of the number (metric) or the body. */
  loading?: boolean;
  children?: React.ReactNode;
};

export function Card({
  ref,
  title,
  titlePlacement = "inside",
  titleClassName,
  icon,
  tone,
  info,
  infoLabel,
  description,
  descriptionPlacement,
  action,
  frame = "card",
  padded = true,
  frameClassName,
  className,
  href,
  value,
  currency,
  valueTone,
  showSign = false,
  valueClassName,
  size = "default",
  delta,
  sub,
  note,
  progress,
  spark,
  loading = false,
  children,
  ...props
}: CardProps) {
  const { displayCurrency } = useDisplayCurrency();
  const metric = value !== undefined;
  const list = frame === "list";
  const bare = frame === "bare";
  const pad = padded && !list;
  const hasTitle = title != null && title !== false && title !== "";
  const outsideTitle = hasTitle && titlePlacement === "outside";
  const outsideDesc = !!description && (descriptionPlacement ?? titlePlacement) === "outside";
  const wrapped = outsideTitle || outsideDesc;
  const interactive = metric || !!href;
  const titleText = typeof title === "string" ? title : undefined;
  // A metric card's `id` doubles as its test id (`metric-<id>`); an explicit data-testid wins.
  const metricTestId = metric && props.id ? `metric-${props.id}` : undefined;

  // Inside a linked card a click on the tip / action must not navigate.
  const stopNav = href ? (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); } : undefined;
  const tip = info ? (
    <InfoTip text={info} label={infoLabel ?? (titleText ? `About ${titleText}` : undefined)} className="-my-1 ml-1 size-5 normal-case" />
  ) : null;
  const titleNode = hasTitle ? (
    <>
      {title}
      {href ? <span onClick={stopNav}>{tip}</span> : tip}
    </>
  ) : null;
  const actionNode = action && href ? <span onClick={stopNav}>{action}</span> : action;
  const descInside = !!description && !outsideDesc;
  const descOutsideNode = outsideDesc ? (
    <div data-slot="card-description" className="mb-2 px-4 text-xs text-muted-foreground">
      {description}
    </div>
  ) : null;
  const noSurface = bare && outsideTitle;
  const bodyPad = pad && !noSurface;

  const currencyCode = currency?.trim() ? currency : displayCurrency;
  const tonePick = valueTone === "auto" && typeof value === "number" ? (value > 0 ? "pos" : value < 0 ? "neg" : "none") : (valueTone ?? "none");
  const strip = spark?.data && spark.data.length > 1 ? spark.data : null;
  const hasSpark = !!strip;
  const subText = sub ?? delta?.text;

  let inner: React.ReactNode;
  if (metric) {
    const shownValue: React.ReactNode =
      typeof value === "number" ? (
        showSign && value > 0 ? <span>{`+${formatCurrency(value, currencyCode)}`}</span> : <AnimatedNumber value={value} currency={currencyCode} />
      ) : (
        value
      );
    // Sized by the card's own width so a narrow card (2-up grid on a phone) never clips the number.
    // Hero: 5xl only once the number column (card minus the 40% sparkline column) fits "808.924.476 ₫" at 48px (@[42rem]).
    const numberSize = size === "hero" ? "text-3xl @[24rem]:text-4xl @[42rem]:text-5xl" : "text-lg @[11rem]:text-xl @[13rem]:text-2xl @[18rem]:text-3xl";
    inner = (
      <div className="@[36rem]:flex @[36rem]:items-stretch @[36rem]:gap-6 h-full">
        <div className={cn("min-w-0", !(hasTitle && !outsideTitle) && "pt-4", size === "hero" ? "@[36rem]:flex-none @[36rem]:min-w-[16rem]" : "@[36rem]:flex-1", hasSpark ? "pb-0 @[36rem]:pb-4" : METRIC_PAD_B)}>
          {hasTitle && !outsideTitle && (
            <CardLabel as="p" icon={icon} tone={tone} action={actionNode} className={titleClassName} tileClassName="transition-transform duration-300 group-hover:scale-110">
              {titleNode}
            </CardLabel>
          )}
          <div className={CARD_PAD_X}>
            {descInside ? <div data-slot="card-description" className="-mt-1 mb-3 text-sm text-muted-foreground">{description}</div> : null}
            {loading ? (
              <span className="inline-block h-7 w-24 animate-shimmer rounded-md align-middle" />
            ) : (
              <div className={cn(numberSize, "font-bold tracking-tight hero-number tabular-nums leading-none", size === "hero" && typeof value === "number" ? "whitespace-nowrap" : "break-words", VALUE_TONE[tonePick], valueClassName)}>
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
                      {delta?.pct != null && <DeltaBadge pct={delta.pct} invert={delta.invert} />}
                      {subText && <span className="min-w-0">{subText}</span>}
                    </div>
                  )}
                  {note && <div>{note}</div>}
                </>
              )}
            </div>
            {children != null && children !== false && <div className={cn("mb-4", className)}>{children}</div>}
            {progress && !loading && (
              <div data-slot="metric-progress" className="mb-4 space-y-1.5">
                <ProgressBar value={progress.value} tone={progress.tone} ariaLabel={progress.ariaLabel ?? titleText ?? "Progress"} className="w-full" />
                <p className="text-xs text-muted-foreground">{progress.caption ?? (progress.value == null ? "" : `${Math.round(progress.value)}%`)}</p>
              </div>
            )}
          </div>
        </div>

        {hasSpark && (
          <>
            {/* wide card: right-hand column, full height */}
            <div className={cn("hidden @[36rem]:block", size === "hero" ? "@[36rem]:flex-1 @[36rem]:min-w-0" : "@[36rem]:w-[40%] @[36rem]:max-w-[18rem]", "@[36rem]:self-center shrink-0 pr-5 py-5 opacity-60 group-hover:opacity-100 transition-opacity duration-300")}>
              <LazyView minHeight={96} className="w-full">
                <Sparkline data={strip!} color={spark!.color ?? "#6366f1"} labels={spark!.labels} currency={currencyCode} height={96} className="w-full sparkline-fade" />
              </LazyView>
            </div>
            {/* narrow card: full-bleed strip along the bottom */}
            <div className="@[36rem]:hidden opacity-50 group-hover:opacity-100 transition-opacity duration-300 -mx-px">
              <LazyView minHeight={44} className="w-full">
                <Sparkline data={strip!} color={spark!.color ?? "#6366f1"} labels={spark!.labels} currency={currencyCode} height={44} />
              </LazyView>
            </div>
          </>
        )}
      </div>
    );
  } else {
    const titled = hasTitle && !outsideTitle;
    const hasBody = loading || (children != null && children !== false) || (descInside && bodyPad);
    inner = (
      <>
        {titled && (
          <CardLabel as="h2" icon={icon} tone={tone} action={actionNode} className={titleClassName}>
            {titleNode}
          </CardLabel>
        )}
        {descInside && !bodyPad ? (
          <div data-slot="card-description" className="px-4 pb-2 pt-3 text-sm text-muted-foreground">
            {description}
          </div>
        ) : null}
        {hasBody ? (
          <div data-slot="card-body" className={cn(bodyPad && (titled ? `${CARD_PAD_X} pb-4` : "p-4"), list && LIST_DIVIDER, className)}>
            {descInside && bodyPad ? <div data-slot="card-description" className="mb-3 text-sm text-muted-foreground">{description}</div> : null}
            {loading ? <div data-slot="card-loading" className="h-16 animate-shimmer rounded-md" /> : children}
          </div>
        ) : null}
      </>
    );
  }

  const surfaceClass = cn(
    !noSurface && SURFACE,
    "@container",
    (list || metric) && "overflow-hidden",
    metric && "h-full",
    interactive && INTERACTIVE,
    href && "cursor-pointer",
    frameClassName,
  );

  let root: React.ReactNode;
  if (wrapped) {
    // Outside title / description: a plain wrapper holds the heading above the card box.
    root = (
      <section ref={ref} data-slot="card" data-title-placement={outsideTitle ? "outside" : "inside"} data-testid={metricTestId} {...props}>
        {outsideTitle ? (
          <h2
            data-slot="card-title-outside"
            className={cn("flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground", bare ? "px-1" : "px-4", descOutsideNode ? "mb-1" : "mb-2", titleClassName)}
          >
            <span className="min-w-0 truncate">{titleNode}</span>
            {actionNode}
          </h2>
        ) : null}
        {descOutsideNode}
        <div data-slot="card-surface" className={surfaceClass}>
          {inner}
        </div>
      </section>
    );
  } else {
    root = (
      <section ref={ref} data-slot="card" data-title-placement={hasTitle ? "inside" : undefined} data-testid={metricTestId} className={surfaceClass} {...props}>
        {inner}
      </section>
    );
  }
  if (!href) return root;
  return (
    <Link href={href} className="block h-full min-w-0">
      {root}
    </Link>
  );
}

/** The green up / red down percentage pill (value already in percent, e.g. -0.5 = -0.5%). */
function DeltaBadge({ pct, invert = false }: { pct: number; invert?: boolean }) {
  const up = pct >= 0;
  const good = invert ? !up : up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 @[11rem]:gap-1 text-xs font-semibold px-1.5 @[11rem]:px-2.5 py-0.5 rounded-full ${
        good ? "text-pos bg-pos/10" : "text-destructive bg-destructive/10"
      }`}
    >
      <Arrow className="h-3 w-3" aria-hidden="true" />
      {up ? "+" : ""}
      {formatPercent(pct, 1)}
    </span>
  );
}

/**
 * Add to a Card (frame="list") that holds a divided list of ListRows: phone keeps the single divided list,
 * regular+ lays the rows out as a 2-column (3 at wide) grid so a list of independent items uses the width.
 */
export const CARD_ROW_GRID =
  "card-row-grid regular:grid regular:grid-cols-2 wide:grid-cols-3 regular:gap-x-6 regular:[&>*]:shadow-[var(--list-divider)]";
