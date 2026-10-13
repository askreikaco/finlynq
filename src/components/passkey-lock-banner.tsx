"use client";

/**
 * Non-blocking chip at the top of the app: shown only when a passkey is enrolled on this browser AND this page is locked
 * (the offline copies cannot be read or queued yet). Unlock runs the passkey ceremony from a click; the queue resumes and
 * the saved balances refresh. Renders nothing otherwise, so signed-out pages and browsers without passkey unlock are unchanged.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePasskeyLock } from "@/lib/data/passkey-unlock";

export function PasskeyLockBanner() {
  const { enabled, locked, unlock } = usePasskeyLock();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!enabled || !locked) return null;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  const onUnlock = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await unlock();
      if (!r.ok) setNote(r.code === "cancelled" ? "Cancelled." : "Could not unlock. Try again.");
    } catch {
      setNote("Could not unlock. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" data-testid="passkey-lock-banner" className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-full border bg-background/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
        <span>Offline data locked: Unlock with passkey</span>
        {offline && <span className="text-xs text-muted-foreground" data-testid="passkey-lock-offline">Unlock with passkey to queue changes offline.</span>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void onUnlock()} data-testid="passkey-lock-unlock">
          {busy ? "Waiting for passkey…" : "Unlock"}
        </Button>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}
