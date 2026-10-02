import * as React from "react";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { Hash } from "lucide-react";

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
    <div className={className} {...props}>
      <MetricCard
        label={typeof label === "string" ? label : "Stat"}
        icon={Hash}
        value={value}
        sub={sub}
      />
    </div>
  );
}

