"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  CONTROL_BOX,
  CONTROL_BOX_COMPACT,
  CONTROL_FOCUS_WITHIN,
  CONTROL_STATE,
  CONTROL_SURFACE,
} from "../control-surface";

/** True inside a FieldGroup: Fields render as divider rows and their controls lose their own box. */
export const FieldRowContext = React.createContext(false);

/**
 * The one box around a text-like control (input, textarea, amount, group combobox): the shared control surface
 * with room for a prefix / suffix next to the control. Inside a FieldGroup the box is dropped (the group is the card).
 */
export function Surface({
  invalid,
  disabled,
  compact,
  row,
  multiline,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "prefix"> & {
  invalid?: boolean;
  disabled?: boolean;
  compact?: boolean;
  row?: boolean;
  multiline?: boolean;
}) {
  return (
    <div
      data-slot="field-surface"
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        "relative flex items-center gap-2",
        row
          ? "min-h-11 dense:pointer-fine:min-h-9 w-full min-w-0 text-base regular:pointer-fine:text-sm"
          : cn(CONTROL_SURFACE, compact ? CONTROL_BOX_COMPACT : CONTROL_BOX, CONTROL_STATE, CONTROL_FOCUS_WITHIN),
        multiline && "h-auto items-start py-2",
        multiline && !row && "min-h-11",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Classes of the bare <input> / <textarea> inside a Surface. */
export const BARE_INPUT =
  "min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed file:mr-2 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground";
