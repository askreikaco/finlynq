import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { CardLabel, CARD_PAD_X, type MetricTone } from "./card-label";

const CARD_SURFACE = "surface-card min-w-0 rounded-xl border border-border/50 text-card-foreground";

/**
 * Native card: 12px radius, p-4. A `label` is the card's own title: rendered INSIDE the card as its
 * first row (UPPERCASE small label, card padding), never as a heading above the card box.
 */
export function SectionCard({
  label,
  labelClassName,
  icon,
  tone,
  action,
  cardClassName,
  className,
  children,
  padded = true,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  label?: React.ReactNode;
  /** Extra classes for the in-card label row (e.g. a sticky date header). */
  labelClassName?: string;
  /** Icon tile before the label (same 32px tile as MetricCard). Omit for sticky date headers / tiny group labels. */
  icon?: LucideIcon;
  /** METRIC_TONES name (or raw classes) for the icon tile. */
  tone?: MetricTone | (string & {});
  /** Optional control on the right of the label row (e.g. an edit button). */
  action?: React.ReactNode;
  /** Classes for the outer card element when a label is present (tints, borders); `className` styles the content area. */
  cardClassName?: string;
  padded?: boolean;
  children?: React.ReactNode;
}) {
  if (!label) {
    return (
      <section data-slot="section-card" {...props}>
        <div data-slot="section-card-body" className={cn(CARD_SURFACE, padded && "p-4", className)}>
          {children}
        </div>
      </section>
    );
  }
  return (
    <section data-slot="section-card" {...props} className={cn(CARD_SURFACE, "@container", cardClassName)}>
      <CardLabel as="h2" slot="section-card-label" icon={icon} tone={tone} action={action} className={labelClassName}>
        {label}
      </CardLabel>
      <div data-slot="section-card-body" className={cn(padded && `${CARD_PAD_X} pb-4`, className)}>
        {children}
      </div>
    </section>
  );
}

/**
 * Add to a SectionCard that holds a divided list of ListRows: phone keeps the single divided list,
 * regular+ lays the rows out as a 2-column (3 at wide) grid so a list of independent items uses the width.
 */
export const CARD_ROW_GRID =
  "regular:grid regular:grid-cols-2 wide:grid-cols-3 regular:gap-x-6 regular:[&>*]:shadow-[var(--list-divider)]";
