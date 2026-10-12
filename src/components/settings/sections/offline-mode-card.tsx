"use client";

/**
 * In-app switch for the offline write queue (local-first L3, beta). Default OFF.
 * State comes from the facade (real on-device flag); the component never touches storage or local-first directly.
 * Disabled with an explanation on untrusted devices, where the queue never runs.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { countUnsyncedWrites, useOfflineKey, useOfflineMode } from "@/lib/data/local-write-queue";

function daysAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
}

export function OfflineModeCard() {
  const { enabled, trusted, setEnabled } = useOfflineMode();
  const key = useOfflineKey(enabled);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const untrusted = trusted === false;

  async function onChange(next: boolean) {
    if (next) return setEnabled(true);
    const n = await countUnsyncedWrites();
    if (n > 0) setConfirmCount(n);
    else setEnabled(false);
  }

  return (
    <Card data-testid="offline-mode-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>Offline mode (beta)</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Save new and edited transactions on this device when you are offline and sync them when you are back online. Home and Accounts also open from the last saved data. Trusted devices only.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => void onChange(v)}
            disabled={trusted !== true}
            aria-label="Offline mode (beta)"
          />
        </div>
      </CardHeader>
      {enabled && trusted === true && (
        <CardContent data-testid="offline-key-section" className="space-y-2">
          <p className="text-sm font-medium">On-device key</p>
          <p className="text-xs text-muted-foreground" data-testid="offline-key-age">
            {key.info
              ? `Created ${daysAgo(key.info.createdAt)}${key.info.rotatedAt ? `, last rotated ${daysAgo(key.info.rotatedAt)}` : ""}. It rotates by itself every 90 days when nothing is waiting to sync.`
              : "Created when you first save something offline."}
          </p>
          <Button variant="outline" size="sm" disabled={key.busy} onClick={() => void key.rotate()} data-testid="offline-key-rotate">
            {key.busy ? "Rotating…" : "Rotate key now"}
          </Button>
          {key.last === "ok" && (
            <p className="text-xs text-muted-foreground" data-testid="offline-key-ok">Key rotated. Waiting changes were kept; saved copies will refill.</p>
          )}
          {key.last === "failed" && (
            <p className="text-xs text-destructive" data-testid="offline-key-failed">Could not rotate the key. Nothing was lost; try again.</p>
          )}
        </CardContent>
      )}
      {untrusted && (
        <CardContent>
          <p className="text-xs text-muted-foreground" data-testid="offline-mode-untrusted">Only on trusted devices</p>
        </CardContent>
      )}
      <ConfirmDialog
        open={confirmCount !== null}
        onOpenChange={(o) => !o && setConfirmCount(null)}
        title="Turn off offline mode"
        description={`${confirmCount ?? 0} unsynced ${confirmCount === 1 ? "change" : "changes"} will be discarded.`}
        confirmLabel="Turn off"
        onConfirm={() => {
          setEnabled(false);
          setConfirmCount(null);
        }}
      />
    </Card>
  );
}
