import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { CardLabel, CARD_PAD_X, type MetricTone } from "./card-label";

const CARD_SURFACE = "surface-card min-w-0 rounded-xl border border-border/50 text-card-foreground";
/** Divided rows: the --list-divider inset shadow under every direct child but the last. */
const LIST_DIVIDER = "[&>*:not(:last-child)]:shadow-[var(--list-divider)]";

export type SectionCardProps = Omit<React.HTMLAttributes<HTMLElement>, "children" | "title"> & {
  /** The card's title. Omit for a plain card. */
  label?: React.ReactNode;
  /** "inside" (default): the label is the card's first row (UPPERCASE, card padding). "outside": a small heading above the card box (px-4). */
  labelPlacement?: "inside" | "outside";
  /** Extra classes for the label row (e.g. a sticky date header). */
  labelClassName?: string;
  /** Help text for an (i) InfoTip next to the label. Prefer this for explanatory copy. */
  info?: React.ReactNode;
  /** Accessible name of the (i) button. Default "About <label>". */
  infoLabel?: string;
  /** Visible one-line description under the label. Use `info` instead when it is explanatory. */
  description?: React.ReactNode;
  /** Where the description sits. Default: follows `labelPlacement` (inside the card / under the outside label). */
  descriptionPlacement?: "inside" | "outside";
  /** Icon tile before the label (32px tile, same as MetricCard). Inside labels only. */
  icon?: LucideIcon;
  /** METRIC_TONES name (or raw classes) for the icon tile. */
  tone?: MetricTone | (string & {});
  /** Optional control on the right of the label row (e.g. an edit button). */
  action?: React.ReactNode;
  /** Classes for the card element (tints, borders, layout); `className` styles the content area. */
  cardClassName?: string;
  /** With labelPlacement="outside": no card surface around the body (label and children sit directly on the page). */
  bare?: boolean;
  /** Body padding (p-4). Ignored by `list`. */
  padded?: boolean;
  /** Divided list of rows (InsetRow, ListRow, ...): unpadded, clipped to the radius, --list-divider between rows. */
  list?: boolean;
  children?: React.ReactNode;
};

/**
 * THE card with a title: label inside or outside the card, an optional description (inside or outside),
 * an (i) InfoTip, icon tile, action, `bare` and `list` variants. Outside labels sit above the card box at
 * px-4; inside labels are the card's first row at the shared CardLabel position.
 */
export function SectionCard({
  label,
  labelPlacement = "inside",
  labelClassName,
  info,
  infoLabel,
  description,
  descriptionPlacement,
  icon,
  tone,
  action,
  cardClassName,
  bare = false,
  padded = true,
  list = false,
  className,
  children,
  ...props
}: SectionCardProps) {
  const pad = padded && !list;
  const bodyList = list && cn("overflow-hidden", LIST_DIVIDER);

  if (!label) {
    return (
      <section data-slot="section-card" {...props}>
        <div data-slot="section-card-body" className={cn(CARD_SURFACE, "@container", cardClassName, pad && "p-4", bodyList, className)}>
          {children}
        </div>
      </section>
    );
  }

  const outside = labelPlacement === "outside";
  const descOutside = (descriptionPlacement ?? labelPlacement) === "outside";
  const text = (
    <>
      {label}
      {info ? (
        <InfoTip text={info} label={infoLabel ?? (typeof label === "string" ? `About ${label}` : undefined)} className="-my-1 ml-1 size-5 normal-case" />
      ) : null}
    </>
  );
  const desc = description ? (
    <p
      data-slot="section-card-description"
      className={cn(
        "text-muted-foreground",
        descOutside ? "mb-2 px-4 text-xs" : cn("text-sm", pad ? "mb-3" : "px-4 pb-2 pt-3"),
      )}
    >
      {description}
    </p>
  ) : null;

  if (outside) {
    return (
      <section data-slot="section-card" data-label-placement="outside" {...props}>
        <h2
          data-slot="section-card-label-outside"
          className={cn("flex items-center justify-between gap-2 px-4 text-sm font-medium text-muted-foreground", desc && descOutside ? "mb-1" : "mb-2", labelClassName)}
        >
          <span className="min-w-0 truncate">{text}</span>
          {action}
        </h2>
        {descOutside ? desc : null}
        <div data-slot="section-card-body" className={cn(!bare && CARD_SURFACE, "@container", cardClassName, !bare && pad && "p-4", bodyList, className)}>
          {descOutside ? null : desc}
          {children}
        </div>
      </section>
    );
  }

  // Inside label: the section IS the card. A description placed "outside" needs a plain wrapper above it.
  const Surface = descOutside ? "div" : "section";
  const card = (
    <Surface
      data-slot={descOutside ? "section-card-surface" : "section-card"}
      data-label-placement={descOutside ? undefined : "inside"}
      {...(descOutside ? {} : props)}
      className={cn(CARD_SURFACE, "@container", list && "overflow-hidden", cardClassName)}
    >
      <CardLabel as="h2" slot="section-card-label" icon={icon} tone={tone} action={action} className={labelClassName}>
        {text}
      </CardLabel>
      {descOutside ? null : desc}
      <div data-slot="section-card-body" className={cn(pad && `${CARD_PAD_X} pb-4`, list && LIST_DIVIDER, className)}>
        {children}
      </div>
    </Surface>
  );
  if (!descOutside) return card;
  return (
    <div data-slot="section-card" data-label-placement="inside" {...props}>
      {desc}
      {card}
    </div>
  );
}

/**
 * Add to a SectionCard that holds a divided list of ListRows: phone keeps the single divided list,
 * regular+ lays the rows out as a 2-column (3 at wide) grid so a list of independent items uses the width.
 */
export const CARD_ROW_GRID =
  "card-row-grid regular:grid regular:grid-cols-2 wide:grid-cols-3 regular:gap-x-6 regular:[&>*]:shadow-[var(--list-divider)]";
