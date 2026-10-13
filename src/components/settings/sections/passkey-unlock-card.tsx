"use client";

/**
 * Passkey unlock for the on-device offline copy (local-first, flagged: localStorage "finlynq.lf.passkey" === "1").
 * Local-only: nothing is registered with the server. It does NOT unlock the server data or replace the password.
 * Hidden unless the flag is on.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getSessionInfo } from "@/lib/data/session-info";
import { countUnsyncedWrites } from "@/lib/data/local-write-queue";
import {
  disablePasskeyUnlock,
  enablePasskeyUnlock,
  getPasskeyUnlockStatus,
  hasPasskeyUnlockedSession,
  isPasskeyUnlockOn,
  unlockWithPasskey,
  type PasskeyResult,
} from "@/lib/data/passkey-unlock";

const MESSAGES: Record<string, string> = {
  ok: "Done.",
  unsupported: "Passkey unlock is not supported on this device or browser. Nothing was changed.",
  cancelled: "Cancelled. Nothing was changed.",
  failed: "Could not complete passkey unlock. Nothing was changed. Try again.",
  not_enabled: "Passkey unlock is not set up on this device.",
  wrong_passkey: "That passkey does not match this device's setup. Your saved data was not changed.",
};

function describe(r: PasskeyResult): string {
  return r.ok ? MESSAGES.ok : MESSAGES[r.code] ?? MESSAGES.failed;
}

export function PasskeyUnlockCard() {
  // UnlockGate renders only a spinner before the client session check, so this card never SSRs with content.
  const [on] = useState(() => isPasskeyUnlockOn());
  const [userId] = useState<string | null>(() => getSessionInfo()?.userId ?? null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);

  const refresh = async (uid: string) => {
    const st = await getPasskeyUnlockStatus(uid);
    setSupported(st.supported);
    setEnabled(st.enabled);
  };

  useEffect(() => {
    if (!on || !userId) return;
    let live = true;
    getPasskeyUnlockStatus(userId).then(
      (st) => {
        if (!live) return;
        setSupported(st.supported);
        setEnabled(st.enabled);
      },
      () => live && setSupported(false),
    );
    return () => {
      live = false;
    };
  }, [on, userId]);

  if (!on || !userId) return null;

  const run = async (fn: () => Promise<PasskeyResult>) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fn();
      setMessage({ tone: r.ok ? "ok" : "error", text: describe(r) });
      await refresh(userId);
    } catch {
      setMessage({ tone: "error", text: MESSAGES.failed });
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    const n = await countUnsyncedWrites().catch(() => 0);
    if (n > 0) setConfirmCount(n);
    else await run(() => disablePasskeyUnlock(userId, { unsyncedCount: 0, confirmed: false }));
  };

  return (
    <Card data-testid="passkey-unlock-card">
      <CardHeader>
        <CardTitle>Passkey unlock (beta)</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Unlock the saved copy on this device with Face ID, Touch ID or Windows Hello. It stays on this device, is never sent to the
          server, and does not replace your password or unlock your server data.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {supported === false && (
          <p className="text-sm text-muted-foreground" data-testid="passkey-unlock-unsupported">
            Not supported on this device or browser.
          </p>
        )}
        {supported === true && !enabled && (
          <Button size="sm" disabled={busy} onClick={() => void run(() => enablePasskeyUnlock(userId))} data-testid="passkey-unlock-enable">
            {busy ? "Waiting for passkey…" : "Turn on passkey unlock"}
          </Button>
        )}
        {supported === true && enabled && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => unlockWithPasskey(userId))}
              data-testid="passkey-unlock-test"
            >
              Test passkey unlock
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void onDisable()} data-testid="passkey-unlock-disable">
              Turn off
            </Button>
            {hasPasskeyUnlockedSession(userId) && <span className="text-xs text-muted-foreground">Verified this session.</span>}
          </div>
        )}
        {message && (
          <p role="status" className={message.tone === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"} data-testid="passkey-unlock-message">
            {message.text}
          </p>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmCount !== null}
        onOpenChange={(o) => !o && setConfirmCount(null)}
        title="Turn off passkey unlock"
        description={`${confirmCount ?? 0} unsynced ${confirmCount === 1 ? "change is" : "changes are"} waiting on this device. Turning off passkey unlock needs your confirmation; it does not delete them.`}
        confirmLabel="Turn off"
        onConfirm={() => {
          const n = confirmCount ?? 0;
          setConfirmCount(null);
          void run(() => disablePasskeyUnlock(userId, { unsyncedCount: n, confirmed: true }));
        }}
      />
    </Card>
  );
}
