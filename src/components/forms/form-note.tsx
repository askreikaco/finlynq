import * as React from "react";

import { cn } from "@/lib/utils";

/** Plain notice card for a form (loading, missing record, load failure). */
export function FormNote({
  tone = "muted",
  className,
  children,
  ...props
}: { tone?: "muted" | "error" } & React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "rounded-xl border bg-card px-4 py-3 text-sm",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
