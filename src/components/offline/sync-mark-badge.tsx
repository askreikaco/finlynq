"use client";

import Link from "next/link";

/** "Waiting to sync" / "Sync failed" badge on a row that is queued on this device (local-first L3). */
export function SyncMarkBadge({ mark }: { mark: { status: "pending" | "failed"; failReason?: string | null } }) {
  if (mark.status === "failed") {
    return (
      <Link href="/settings/data" className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive hover:underline" title={mark.failReason ?? "Sync failed"}>
        Sync failed
      </Link>
    );
  }
  return (
    <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title="Saved on this device; it syncs when you are online">
      Waiting to sync
    </span>
  );
}
