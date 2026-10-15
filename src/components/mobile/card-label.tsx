import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CardLabel — the ONE card title row, drawn by `Card` (ui/card.tsx) for every card (Total Net Worth, Action Center,
 * Weekly Recap, ...) and by FieldGroup: icon tile + uppercase label at the same position, padding and
 * typography on every card. Every number below is the single source of truth for that position.
 */

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

/** Left/right padding of a card's content. Container-query based: needs an `@container` ancestor. */
export const CARD_PAD_X = "px-3 @[11rem]:px-5";
/** Top padding of the label row: the Card frame has no vertical padding, the row pads itself. */
export const CARD_LABEL_TOP = "pt-7 regular:pt-8 dense:pointer-fine:pt-[26px]";
/** Gap between the icon tile and the label, and the space under the row. */
export const CARD_LABEL_GAP = "gap-2.5";
export const CARD_LABEL_MB = "mb-3";
/** Label typography. */
export const CARD_LABEL_TEXT = "text-xs font-medium tracking-wide uppercase text-muted-foreground leading-tight";
/** 32px icon tile. */
export const CARD_ICON_TILE = "flex h-8 w-8 items-center justify-center rounded-lg shrink-0";

export function resolveTone(tone: MetricTone | (string & {}) | undefined): string {
  const t = tone ?? "muted";
  return t in METRIC_TONES ? METRIC_TONES[t as MetricTone] : t;
}

export type CardLabelProps = {
  children: React.ReactNode;
  icon?: LucideIcon;
  /** A METRIC_TONES name, or raw classes for the icon tile. */
  tone?: MetricTone | (string & {});
  /** Heading element for the label text. */
  as?: "h2" | "h3" | "p" | "div";
  /** Optional control on the right of the row. */
  action?: React.ReactNode;
  /** Extra classes for the row (e.g. a sticky date header). */
  className?: string;
  /** Extra classes for the icon tile (e.g. group-hover scale). */
  tileClassName?: string;
  /** data-slot of the label text element. */
  slot?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">;

export function CardLabel({
  children,
  icon: Icon,
  tone = "muted",
  as: Tag = "p",
  action,
  className,
  tileClassName,
  slot = "card-label-text",
  ...props
}: CardLabelProps) {
  return (
    <div
      data-slot="card-label"
      className={cn("flex items-center", CARD_LABEL_GAP, CARD_LABEL_MB, CARD_LABEL_TOP, CARD_PAD_X, className)}
    >
      {Icon && (
        <div className={cn(CARD_ICON_TILE, resolveTone(tone), tileClassName)} data-slot="card-label-icon">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
      <Tag data-slot={slot} className={cn("min-w-0 break-words", CARD_LABEL_TEXT)} {...props}>
        {children}
      </Tag>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}
