"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/sparkline";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * ListRow: THE row of every list in the app (accounts, holdings, transactions, subscriptions, loans, goals,
 * categories, hubs, menus, admin and report lists). Every part is optional and shows when its prop is given:
 *
 *   [leading: icon tile | initials | status dot | node] [title + subtitle (+ count, badge)]
 *   [chart] [progress bar + label] [delta] [value + secondary] [trailing] [unread] [chevron]
 *
 * Narrow (container < 48rem): line 1 = title | value, line 2 = chart + bar + label | delta.
 * Wide (container >= 48rem) with a chart or bar: one line, value column right aligned.
 * Rows are square (the card clips the first and last); `shape="rounded"` is the explicit exception.
 * Separators are the --list-divider shadow of the surrounding card, never a border on the row.
 * Domain wrappers (AccountRow, HoldingRow, TxRow, CategoryRow, ...) only map data to these props.
 */

export type SecondaryTone = "pos" | "neg" | "muted";
const TONE: Record<SecondaryTone, string> = {
  pos: "text-pos",
  neg: "text-neg",
  muted: "text-muted-foreground",
};

/** Colour of the leading circle tile. */
export type TileTone = "muted" | "pos" | "neg" | "warn" | "primary";
const TILE: Record<TileTone, string> = {
  muted: "bg-muted text-muted-foreground dark:text-foreground",
  pos: "bg-pos/10 text-pos",
  neg: "bg-destructive/10 text-destructive",
  warn: "bg-warning/10 text-warning",
  primary: "bg-primary/10 text-primary",
};

/** Text tone of the row: normal, accent (primary action) or destructive (log out, delete). */
type RowTone = "default" | "accent" | "destructive";
const TITLE_TONE: Record<RowTone, string> = {
  default: "text-foreground",
  accent: "text-primary",
  destructive: "text-destructive",
};
const TONE_TILE: Record<RowTone, TileTone | undefined> = { default: undefined, accent: "primary", destructive: "neg" };

export type ProgressTone = "primary" | "warning" | "destructive" | "pos";
const BAR_TONE: Record<ProgressTone, string> = {
  primary: "bg-primary",
  warning: "bg-warning",
  destructive: "bg-destructive",
  pos: "bg-pos",
};

/** The ONE thin progress bar (ListRow's mini bar, MetricCard's progress part). `value` 0..100, clamped; null = empty track. */
export function ProgressBar({ value, tone = "primary", ariaLabel, className }: { value: number | null; tone?: ProgressTone; ariaLabel: string; className?: string }) {
  const fill = value == null ? null : Math.min(100, Math.max(0, value));
  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fill ?? 0}
      className={cn("block h-1.5 shrink-0 overflow-hidden rounded-full bg-muted", className)}
    >
      {fill != null ? <span className={cn("block h-full rounded-full", BAR_TONE[tone])} style={{ width: `${fill}%` }} /> : null}
    </span>
  );
}

interface RowProgress {
  /** Fill 0..100 (uncapped values are clamped); null = bar without fill. */
  pct: number | null;
  tone?: ProgressTone;
  /** Text next to the bar ("Left $5", "40%", "No budget"). */
  label: React.ReactNode;
  labelClassName?: string;
  /** Accessible name of the bar. */
  aria: string;
}

export interface ListRowBase {
  title: React.ReactNode;
  /** At most one subtitle line (meta: category · account, deadline, rate). */
  subtitle?: React.ReactNode;
  strike?: boolean;

  /* leading: at most one of icon / initials / dot / leading */
  /** 36px circle tile with a lucide icon. */
  icon?: LucideIcon;
  /** 36px circle tile with initials (avatar). */
  initials?: string;
  tile?: TileTone;
  /** Status dot colour (a CSS colour or var(--token), see src/lib/status-colour.ts). */
  dot?: string;
  /** Any other leading node. */
  leading?: React.ReactNode;

  /* trailing */
  /** The ONE primary value (an <Amount/> or a formatted string). */
  value?: React.ReactNode;
  /** Settings style: the value is a quiet, regular-weight trailing text (a plan name, a setting's current value). */
  quietValue?: boolean;
  /** At most one small secondary value under it (converted amount, %, date). */
  secondary?: React.ReactNode;
  secondaryTone?: SecondaryTone;
  /** Change / "of target" text: under the value on narrow rows, its own column on wide rows with a chart or bar. */
  delta?: React.ReactNode;
  deltaTone?: string;
  deltaTitle?: string;
  /** Mini chart series, oldest first. `null` keeps the chart slot empty so columns line up; omit for no chart. */
  trend?: number[] | null;
  trendLabels?: string[];
  /** Chart tint when `dot` is a CSS variable (SVG gradients cannot resolve var()); defaults to `dot`. */
  trendColor?: string;
  currency?: string;
  progress?: RowProgress;
  /** Number of items in a group (muted pill after the title). */
  count?: number;
  /** Small node after the title (sync mark). */
  badge?: React.ReactNode;
  /** Unread / pending count (primary pill before the chevron), shown when > 0. */
  unread?: number;
  /** Any other trailing node (switch, badge), before the chevron. Inside the row's link / button. */
  trailing?: React.ReactNode;
  /** Buttons or links beside a pressable row (delete, post, skip): rendered OUTSIDE the row's own link / button, so they never nest. */
  actions?: React.ReactNode;
  /** Indent the title only (child row of a group); value columns stay aligned. */
  indent?: boolean;
  /** Defaults to true for interactive rows. "reserve" keeps the chevron's width empty so value columns line up with rows that show one. */
  chevron?: boolean | "reserve";

  /* behaviour */
  /** Link row. */
  href?: string;
  /**
   * Press handler. Button row when there is no href; on a link row it is the click handler, so a split view can
   * `e.preventDefault()` and select (?sel=<id>) instead of navigating.
   */
  onPress?: (e: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  /** Multi-select mode: a leading checkbox; a click anywhere on the row toggles it. */
  select?: { checked: boolean; onToggle: () => void; label: string };
  /** Faded (archived, inactive). */
  dimmed?: boolean;
  /** Split view: this row is the one open in the detail pane. */
  selected?: boolean;
  tone?: RowTone;
  /** Native tooltip of the row (HTML title attribute). */
  hint?: string;

  /* look */
  /** "regular" is 56px (44px under data-density=compact); "dense" is always 44px. */
  size?: "regular" | "dense";
  /** "square" (default) or "rounded". */
  shape?: "square" | "rounded";
  /** Render as spans without padding or hover, inside another interactive element (accordion trigger, link). */
  embedded?: boolean;
  /** data-slot prefix of the row parts: "category" -> category-row, category-dot, category-label, ... */
  slot?: string;
  className?: string;
  "aria-label"?: string;
}

/** Row props plus any data-* attribute (data-testid, data-edit-row, ...), passed to the row element. */
export type ListRowProps = ListRowBase & { [attr: `data-${string}`]: string | undefined };

/**
 * Native list row. Below md lists never use multi-column tables: one primary value on the right, everything
 * else lives in the detail pane / page.
 */
export function ListRow({
  title, subtitle, strike,
  icon: Icon, initials, tile, dot, leading,
  value, quietValue, secondary, secondaryTone = "muted", delta, deltaTone = "text-muted-foreground", deltaTitle,
  trend, trendLabels, trendColor, currency, progress, count, badge, unread, trailing, actions, indent, chevron,
  href, onPress, disabled, dimmed, select, selected, tone = "default", hint,
  size = "regular", shape = "square", embedded, slot = "list", className, ...rest
}: ListRowProps) {
  const interactive = !embedded && (!!href || !!onPress || !!select);
  const showChevron = chevron === "reserve" ? false : (chevron ?? ((!!href || !!onPress) && !embedded && tone !== "destructive"));
  const hasMiddle = trend !== undefined || !!progress;
  const tileTone = tile ?? TONE_TILE[tone] ?? "muted";

  const lead =
    leading ??
    (Icon || initials ? (
      <span data-slot="list-row-tile" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold", TILE[tileTone])}>
        {Icon ? <Icon className="size-[18px]" aria-hidden /> : initials}
      </span>
    ) : dot ? (
      <span data-slot={`${slot}-dot`} className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
    ) : null);

  const hasValue = value !== undefined || secondary !== undefined;

  const body = (
    <>
      {select ? (
        <Checkbox
          checked={select.checked}
          onChange={select.onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-label={select.label}
          className="shrink-0"
        />
      ) : null}
      <span
        className={cn(
          "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5",
          hasMiddle && "@3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7.5rem_6.5rem]",
        )}
      >
        <span className={cn("flex min-w-0 items-center", dot && !Icon && !initials && !leading ? "gap-2.5" : "gap-3", indent && "pl-5")}>
          {lead}
          <span className="flex min-w-0 flex-col">
            <span
              data-slot={`${slot}-label`}
              className={cn("truncate text-sm font-medium", strike ? "text-muted-foreground line-through" : TITLE_TONE[tone])}
            >
              {title}
            </span>
            {subtitle ? <span data-slot={`${slot}-meta`} className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
          </span>
          {count != null ? (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
              {count}
            </span>
          ) : null}
          {badge}
        </span>
        {hasValue || hasMiddle ? (
          <span data-slot={`${slot}-amount`} className={cn("flex min-w-0 max-w-[60cqw] flex-col items-end text-right text-sm tabular-nums @3xl:order-4", quietValue ? "text-muted-foreground" : "font-semibold")}>
            {value}
            {secondary !== undefined ? (
              <span
                data-slot="list-row-secondary"
                data-tone={secondaryTone}
                className={cn("max-w-full truncate whitespace-nowrap text-xs font-normal", TONE[secondaryTone])}
              >
                {secondary}
              </span>
            ) : null}
          </span>
        ) : null}
        {hasMiddle ? (
          <>
            <span className="flex min-w-0 items-center gap-2 @3xl:order-2 @3xl:gap-3">
              {trend !== undefined ? (
                <span data-slot={`${slot}-chart`} className="block h-5 w-12 shrink-0 @max-[22rem]:hidden @3xl:w-16">
                  {trend && trend.length > 1 ? (
                    <Sparkline data={trend} color={trendColor ?? dot ?? "currentColor"} labels={trendLabels} currency={currency} height="100%" className="h-full w-full" />
                  ) : null}
                </span>
              ) : null}
              {progress ? (
                <span data-slot={`${slot}-budget`} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <ProgressBar value={progress.pct} tone={progress.tone} ariaLabel={progress.aria} className="w-[10cqw] min-w-10 max-w-24 @3xl:min-w-14" />
                  <span className={cn("whitespace-nowrap", progress.labelClassName)}>{progress.label}</span>
                </span>
              ) : null}
            </span>
            <span data-slot={`${slot}-delta`} title={deltaTitle} className={cn("whitespace-nowrap text-right text-xs font-medium @3xl:order-3", deltaTone)}>
              {delta}
            </span>
          </>
        ) : delta !== undefined ? (
          <span data-slot={`${slot}-delta`} title={deltaTitle} className={cn("col-span-2 whitespace-nowrap text-right text-xs font-medium", deltaTone)}>
            {delta}
          </span>
        ) : null}
      </span>
      {trailing}
      {unread != null && unread > 0 ? (
        <span data-slot="list-row-unread" className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-primary-foreground">
          {unread}
        </span>
      ) : null}
      {showChevron ? <ChevronRight data-slot="list-row-chevron" aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : chevron === "reserve" ? <span aria-hidden className="size-4 shrink-0" /> : null}
    </>
  );

  const minH = size === "dense" ? "min-h-11" : "min-h-[56px] dense:min-h-11";
  const pad = size === "dense" ? "px-4 py-1.5" : "px-4 py-2 dense:py-1.5";
  const press = "outline-none transition-colors hover:bg-muted/50 active:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset";
  const state = cn(
    shape === "rounded" && "rounded-group",
    selected && "bg-muted hover:bg-muted",
    select?.checked && "bg-primary/5",
    disabled && "pointer-events-none opacity-50",
    dimmed && "opacity-60",
    className,
  );
  const flush = actions && !embedded;
  const cls = cn(
    "@container flex w-full min-w-0 items-center gap-3 text-left",
    embedded ? "font-sans" : flush ? "min-w-0 flex-1 self-stretch pl-4 pr-1 py-2" : cn(minH, pad),
    interactive && press,
    select && "cursor-pointer",
    flush ? undefined : state,
  );
  const sel = {
    ...(selected ? { "data-selected": "true", "aria-current": "true" as const } : {}),
    ...(tone !== "default" ? { "data-variant": tone } : {}),
    ...(hint ? { title: hint } : {}),
  };
  const slotName = `${slot}-row`;
  if (flush) {
    const inner = href ? (
      <Link href={href} onClick={onPress} className={cls}>{body}</Link>
    ) : onPress ? (
      <button type="button" onClick={onPress} disabled={disabled} className={cls}>{body}</button>
    ) : (
      <div className={cls}>{body}</div>
    );
    return (
      <div data-slot={slotName} className={cn("flex w-full min-w-0 items-center gap-1", minH, state)} {...sel} {...rest}>
        {inner}
        <span data-slot="list-row-actions" className="flex shrink-0 items-center gap-1.5 pr-4">{actions}</span>
      </div>
    );
  }
  if (embedded) return <span data-slot={slotName} className={cls} {...sel} {...rest}>{body}</span>;
  if (href) {
    return (
      <Link data-slot={slotName} href={href} onClick={onPress} aria-disabled={disabled ? "true" : undefined} className={cls} {...sel} {...rest}>
        {body}
      </Link>
    );
  }
  if (onPress) {
    return (
      <button data-slot={slotName} type="button" onClick={onPress} disabled={disabled} className={cls} {...sel} {...rest}>
        {body}
      </button>
    );
  }
  return <div data-slot={slotName} className={cls} onClick={select?.onToggle} {...sel} {...rest}>{body}</div>;
}
