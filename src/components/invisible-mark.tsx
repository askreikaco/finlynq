import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon shown beside an account that is hidden from net worth, totals, reports and metrics (the "Invisible" setting). */
export function InvisibleMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Invisible: hidden from net worth, totals, reports and metrics"
      title="Invisible: hidden from net worth, totals, reports and metrics"
      data-testid="invisible-mark"
      className={cn("inline-flex shrink-0 items-center text-muted-foreground", className)}
    >
      <EyeOff className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
