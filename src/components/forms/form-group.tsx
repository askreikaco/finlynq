import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Grouped card that holds FormRow children, separated by hairline dividers.
 * Same classes as the former ListCard (transactions/new), so the shim is exact.
 */
export function FormGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl dense:rounded-xl border border-border bg-card [&>*:not(:last-child)]:shadow-[var(--list-divider)] overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}
