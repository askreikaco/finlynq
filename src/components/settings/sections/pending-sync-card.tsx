"use client";

/**
 * Offline write queue status (local-first L3). Renders nothing unless the opt-in is on AND something is queued,
 * so with the flag off Settings is unchanged. Pending = waiting to sync; Failed = rejected by the server, with Retry / Discard.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { discardPendingSync, retryPendingSync, usePendingSync } from "@/lib/data/local-write-queue";
import { usePasskeyLock } from "@/lib/data/passkey-unlock";

/** What each queued kind is called on the Pending sync list (the copy the user sees). */
const ENTITY_LABEL: Record<string, string> = {
  transaction: "Transaction",
  budget: "Budget",
  goal: "Goal",
  rule: "Rule",
  account: "Account",
  category: "Category",
};

export function PendingSyncCard() {
  const { items, enabled, locked } = usePendingSync();
  const passkey = usePasskeyLock();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  if (locked) {
    return (
      <Card data-testid="pending-sync-locked">
        <CardHeader>
          <CardTitle>Pending sync</CardTitle>
          <p className="text-xs text-muted-foreground" data-keep="status">Locked</p>
        </CardHeader>
        <CardContent>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void passkey.unlock().finally(() => setBusy(false));
            }}
          >
            {busy ? "Waiting for passkey…" : "Use passkey to unlock"}
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (items.length === 0) return null;
  const pending = items.filter((i) => i.status === "pending");
  const failed = items.filter((i) => i.status === "failed");
  return (
    <Card data-testid="pending-sync-card">
      <CardHeader>
        <CardTitle>Pending sync</CardTitle>
        <p className="text-xs text-muted-foreground" data-keep="status">
          {pending.length > 0 ? `${pending.length} waiting to sync.` : "Nothing waiting."}
          {failed.length > 0 ? ` ${failed.length} failed.` : ""}
        </p>
      </CardHeader>
      {failed.length > 0 && (
        <CardContent className="space-y-3">
          {failed.map((i) => (
            <div key={i.opId} className="flex items-center justify-between gap-3" data-testid="pending-sync-failed">
              <div className="min-w-0">
                <div className="truncate text-sm">
                  {i.summary || `${ENTITY_LABEL[i.entity] ?? "Item"} ${i.kind === "create" ? "new" : i.kind === "delete" ? "delete" : "edit"}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ENTITY_LABEL[i.entity] ?? "Item"} · {i.failReason ?? "Rejected by the server"}
                </div>
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
