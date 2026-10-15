"use client";

import * as React from "react";

import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

export interface DialogHeadingProps {
  /** The dialog title (1-4 words). */
  children: React.ReactNode;
  /** The explanation that used to be a visible DialogDescription: shown in an (i) tip beside the title. */
  help: React.ReactNode;
  /** Accessible name of the (i) button. Default "About this dialog". */
  helpLabel?: string;
  className?: string;
}

/**
 * Dialog title + (i) tip. The help text lives in the InfoTip; a screen-reader-only DialogDescription keeps the
 * dialog described for assistive tech. Use instead of a visible <DialogDescription> paragraph.
 * Destructive confirmations keep their visible text (ConfirmDialog) and do not use this.
 */
export function DialogHeading({ children, help, helpLabel = "About this dialog", className }: DialogHeadingProps) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-1">
        <DialogTitle className={cn("min-w-0", className)}>{children}</DialogTitle>
        <InfoTip text={help} label={helpLabel} />
      </div>
      <DialogDescription className="sr-only">{help}</DialogDescription>
    </>
  );
}
