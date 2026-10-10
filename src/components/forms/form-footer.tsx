import * as React from "react";

import { cn } from "@/lib/utils";

/** Bottom action bar of a form: right-aligned, clears the phone safe area. */
export function FormFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-4 flex items-center justify-end gap-2 pb-[calc(var(--sab,0px)+1.5rem)]",
        className,
      )}
      {...props}
    />
  );
}
