import * as React from "react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./section-label";

const CARD_SURFACE = "surface-card min-w-0 rounded-xl border border-border/50 text-card-foreground";

/**
 * Native card: 12px radius, p-4. A `label` is the card's own title: rendered INSIDE the card as its
 * first row (UPPERCASE small label, card padding), never as a heading above the card box.
 */
export function SectionCard({
  label,
  className,
  children,
  padded = true,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  label?: React.ReactNode;
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
    <section data-slot="section-card" {...props} className={cn(CARD_SURFACE, props.className)}>
      <SectionLabel data-slot="section-card-label" className="px-4 pb-2 pt-4">
        {label}
      </SectionLabel>
      <div data-slot="section-card-body" className={cn(padded && "px-4 pb-4", className)}>
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
  "regular:grid regular:grid-cols-2 wide:grid-cols-3 regular:gap-x-6 regular:divide-y-0 regular:[&>*]:border-b regular:[&>*]:border-border/50";
