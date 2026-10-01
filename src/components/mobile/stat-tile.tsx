import * as React from "react";
import { cn } from "@/lib/utils";

/** Compact stat: 13/600 muted label over a value. Replaces tall icon-badge stat cards below md. */
export function StatTile({
  label,
  value,
  sub,
  className,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div
      data-slot="stat-tile"
      className={cn("min-w-0 rounded-xl border border-border/50 bg-card px-4 py-3", className)}
      {...props}
    >
      <p className="truncate text-[13px] font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 min-w-0 text-lg font-bold">{value}</div>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
