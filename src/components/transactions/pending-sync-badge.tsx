"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PendingSyncMark } from "@/app/(app)/transactions/_types";

/**
 * Offline queue state of a transaction row (local-first L3, flag off = never rendered).
 * Waiting: saved on this device, will sync. Failed: the server rejected it; links to Settings > Data (Retry / Discard).
 */
export function PendingSyncBadge({ mark }: { mark: PendingSyncMark | undefined }) {
  if (!mark) return null;
  if (mark.status === "failed") {
    return (
      <Link href="/settings/data" onClick={(e) => e.stopPropagation()} title={mark.failReason ?? "Rejected by the server"}>
        <Badge variant="outline" data-testid="tx-sync-failed" className="text-xs shrink-0 border-destructive/30 bg-destructive/10 text-destructive">
          Sync failed
        </Badge>
      </Link>
    );
  }
  return (
    <Badge variant="outline" data-testid="tx-waiting-sync" className="text-xs shrink-0 border-warning/40 bg-warning/10 text-warning">
      Waiting to sync
    </Badge>
  );
}
