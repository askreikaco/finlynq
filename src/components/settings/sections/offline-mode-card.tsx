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
import { countUnsyncedWrites, useOfflineMode } from "@/lib/data/local-write-queue";

export function OfflineModeCard() {
  const { enabled, trusted, setEnabled } = useOfflineMode();
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
              Save new and edited transactions on this device when you are offline and sync them when you are back online. Trusted devices only.
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
