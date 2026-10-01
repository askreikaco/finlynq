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
          "min-w-0 rounded-xl border border-border/50 bg-card text-card-foreground",
          padded && "p-4",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}
