import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Container names. Literal class strings so Tailwind generates them.
 * Variants in globals.css target the name "app" (`regular:`, `wide:`).
 */
const CONTAINER_CLASS = {
  anon: "@container",
  app: "@container/app",
  shell: "@container/shell",
} as const;

export type ContainerName = Exclude<keyof typeof CONTAINER_CLASS, "anon">;

export interface ContainerQueryProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Named container, e.g. "app". Omit for an unnamed container. */
  name?: ContainerName;
}

/**
 * Wrapper that makes its box a size-query container. Use only where the subtree has no
 * position:fixed children that must stay viewport-anchored: container-type applies layout
 * containment, which makes the container the containing block for fixed descendants.
 */
export function ContainerQuery({ name, className, ...rest }: ContainerQueryProps) {
  return <div className={cn(name ? CONTAINER_CLASS[name] : CONTAINER_CLASS.anon, className)} {...rest} />;
}
