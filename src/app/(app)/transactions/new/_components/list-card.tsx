"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** Rounded card that holds FormRow children, separated by hairline dividers. */
export function ListCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}
