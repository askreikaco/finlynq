"use client";

/**
 * RefreshButton: icon-only "Refresh" for pages with cached metric cards / charts. Revalidates every API key that is
 * mounted on the page (bypassing the browser HTTP cache) and spins ONLY while one of them is fetching.
 * Mounted in the PageToolbar trailing slot (`<PageToolbar refresh />`).
 */
import { RefreshCw } from "lucide-react";
import { RoundIconButton } from "@/components/ui/round-icon-button";
import { useRefreshAll } from "@/lib/data/fetch-activity";
import { cn } from "@/lib/utils";

export function RefreshButton({ className }: { className?: string }) {
  const { refresh, fetching } = useRefreshAll();
  return (
    <RoundIconButton
      type="button"
      aria-label="Refresh"
      title="Refresh"
      data-slot="refresh-button"
      data-fetching={fetching ? "true" : "false"}
      aria-busy={fetching}
      className={className}
      onClick={() => {
        void refresh();
      }}
    >
      <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} aria-hidden />
    </RoundIconButton>
  );
}
