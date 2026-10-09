import * as React from "react";
import { cn } from "@/lib/utils";

export type AdaptiveTag = "div" | "span" | "section";

export interface AdaptiveProps extends React.HTMLAttributes<HTMLElement> {
  as?: AdaptiveTag;
}

/** Rendered only below the md breakpoint (hidden from md up). */
export function CompactOnly({ as: Tag = "div", className, ...rest }: AdaptiveProps) {
  return <Tag className={cn("md:hidden", className)} {...rest} />;
}

/** Rendered only from the md breakpoint up (hidden below md). */
export function FromMd({ as: Tag = "div", className, ...rest }: AdaptiveProps) {
  return <Tag className={cn("max-md:hidden", className)} {...rest} />;
}
