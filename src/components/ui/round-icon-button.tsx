"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { CONTROL_SURFACE } from "@/components/ui/control-surface";
import { cn } from "@/lib/utils";

/**
 * The ONE round icon-only button: 44px circle (month arrows, search, filter, the top bar's icon cells). Every
 * icon-only toolbar / header button uses this component, never hand-written classes.
 *  - surface (default): card colour, border and inner shadow (CONTROL_SURFACE), for a button standing alone.
 *  - surface={false}: bare round hover tint, for a button inside something that already has the surface (the
 *    month switcher group, the header capsule).
 */
export const ROUND_ICON_BUTTON_CLASS = "size-11 pointer-coarse:size-11 dense:pointer-fine:size-11 rounded-full p-0";

export function RoundIconButton({
  surface = true,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "variant"> & { surface?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      data-slot="round-icon-button"
      className={cn(ROUND_ICON_BUTTON_CLASS, surface && CONTROL_SURFACE, className)}
      {...props}
    />
  );
}
