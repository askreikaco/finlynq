import * as React from "react";
import { cn } from "@/lib/utils";

/** Native section label: 12/700 UPPERCASE, letter-spacing .5, muted. */
export function SectionLabel({
  className,
  children,
  as: Tag = "h2",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "h2" | "h3" | "p" | "div" }) {
  return (
    <Tag
      data-slot="section-label"
      className={cn("px-1 text-xs font-bold uppercase tracking-normal text-muted-foreground", className)}
      {...props}
    >
      {children}
    </Tag>
  );
}
