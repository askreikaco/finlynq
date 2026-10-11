"use client";

/**
 * Offline write queue status (local-first L3). Renders nothing unless the opt-in is on AND something is queued,
 * so with the flag off Settings is unchanged. Pending = waiting to sync; Failed = rejected by the server, with Retry / Discard.
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { discardPendingSync, retryPendingSync, usePendingSync } from "@/lib/data/local-write-queue";

export function PendingSyncCard() {
  const { items, enabled } = usePendingSync();
  if (!enabled || items.length === 0) return null;
  const pending = items.filter((i) => i.status === "pending");
  const failed = items.filter((i) => i.status === "failed");
  return (
    <Card data-testid="pending-sync-card">
      <CardHeader>
        <CardTitle>Pending sync</CardTitle>
        <CardDescription>
          {pending.length > 0 ? `${pending.length} saved on this device, will sync when online.` : "Nothing waiting."}
          {failed.length > 0 ? ` ${failed.length} could not be saved.` : ""}
        </CardDescription>
      </CardHeader>
      {failed.length > 0 && (
        <CardContent className="space-y-3">
          {failed.map((i) => (
            <div key={i.opId} className="flex items-center justify-between gap-3" data-testid="pending-sync-failed">
              <div className="min-w-0">
                <div className="truncate text-sm">{i.summary || (i.kind === "create" ? "New transaction" : i.kind === "delete" ? "Delete" : "Edit")}</div>
                <div className="text-xs text-muted-foreground">{i.failReason ?? "Rejected by the server"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{i.kind === "create" ? "New" : i.kind === "delete" ? "Delete" : "Edit"}</Badge>
                <Button size="sm" variant="outline" onClick={() => void retryPendingSync(i.opId)}>Retry</Button>
                <Button size="sm" variant="outline" onClick={() => void discardPendingSync(i.opId)}>Discard</Button>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
