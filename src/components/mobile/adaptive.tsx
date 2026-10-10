import * as React from "react";
import { cn } from "@/lib/utils";

export type AdaptiveTag = "div" | "span" | "section";

export interface AdaptiveProps extends React.HTMLAttributes<HTMLElement> {
  as?: AdaptiveTag;
}

/** Rendered only below regular (640px): hidden from regular: up. Default display is kept. */
export function CompactOnly({ as: Tag = "div", className, ...rest }: AdaptiveProps) {
  return <Tag className={cn("regular:hidden", className)} {...rest} />;
}

/** Rendered only from regular (640px) up: hidden below it. Default display is kept. */
export function FromMd({ as: Tag = "div", className, ...rest }: AdaptiveProps) {
  return <Tag className={cn("max-regular:hidden", className)} {...rest} />;
}
