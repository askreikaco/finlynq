import * as React from "react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./section-label";

/** Native card: 12px radius, p-4, optional UPPERCASE section label above. */
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
  return (
    <section data-slot="section-card" className="space-y-2" {...props}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <div
        data-slot="section-card-body"
        className={cn(
          "surface-card min-w-0 rounded-xl border border-border/50 text-card-foreground",
          padded && "p-4",
          className,
        )}
      >
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
