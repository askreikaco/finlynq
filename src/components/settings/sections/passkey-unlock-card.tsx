"use client";

/**
 * Passkey unlock for the on-device offline copy (local-first, flagged: localStorage "finlynq.lf.passkey" === "1").
 * Local-only: nothing is registered with the server. It does NOT unlock the server data or replace the password.
 * Once turned on, the offline outbox and snapshot are sealed under a second layer that needs this passkey (see the
 * lifecycle module). Hidden unless the flag is on.
 */
import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/ui/overlay";
import { getSessionInfo } from "@/lib/data/session-info";
import { countUnsyncedWrites } from "@/lib/data/local-write-queue";
import {
  disablePasskeyUnlock,
  enablePasskeyUnlock,
  forgetPasskeyAndDiscardOffline,
  getPasskeyUnlockStatus,
  hasPasskeyUnlockedSession,
  isPasskeyUnlockOn,
  unlockWithPasskey,
  usePasskeyLock,
  type PasskeyResult,
} from "@/lib/data/passkey-unlock";

const MESSAGES: Record<string, string> = {
  ok: "Done.",
  unsupported: "Passkey unlock is not supported on this device or browser. Nothing was changed.",
  cancelled: "Cancelled. Nothing was changed.",
  failed: "Could not complete passkey unlock. Nothing was changed. Try again.",
  not_enabled: "Passkey unlock is not set up on this device.",
  wrong_passkey: "That passkey does not match this device's setup. Your saved data was not changed.",
  already_enabled: "Passkey unlock is already on for this browser.",
  untrusted: "Passkey unlock works only on a trusted device. Nothing was changed.",
  offline_off: "Turn on offline mode first. Passkey unlock protects the offline copy.",
  unsynced_blocked: "Unsynced changes are waiting on this device. Nothing was changed.",
};

function describe(r: PasskeyResult): string {
  if (r.ok) return MESSAGES.ok;
  if (r.code === "failed" && r.failed) {
    return `Could not turn passkey unlock on: ${r.failed} offline ${r.failed === 1 ? "change" : "changes"} could not be protected. Nothing was changed.`;
  }
  return MESSAGES[r.code] ?? MESSAGES.failed;
}

export function PasskeyUnlockCard() {
  // UnlockGate renders only a spinner before the client session check, so this card never SSRs with content.
  const [on] = useState(() => isPasskeyUnlockOn());
  const [userId] = useState<string | null>(() => getSessionInfo()?.userId ?? null);
  const passkey = usePasskeyLock();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [forgetCount, setForgetCount] = useState<number | null>(null);

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

  const onForget = async () => {
    const n = await countUnsyncedWrites().catch(() => 0);
    setForgetCount(n);
  };

  return (
    <Card data-testid="passkey-unlock-card">
      <CardHeader>
        <CardTitle icon={KeyRound} tone="violet">
          Passkey unlock (beta)
          <InfoTip
            label="About passkey unlock"
            text="Protects the offline copy with Face ID, Touch ID or Windows Hello. It opens only after the passkey, in this tab until reload. Stays on this device; does not replace your password."
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {supported === false && (
          <p className="text-sm text-muted-foreground" data-keep="status" data-testid="passkey-unlock-unsupported">
            Not supported here.
          </p>
        )}
        {supported === true && !enabled && (
          <Button size="sm" disabled={busy} onClick={() => void run(() => enablePasskeyUnlock(userId))} data-testid="passkey-unlock-enable">
            {busy ? "Waiting for passkey…" : "Turn on"}
          </Button>
        )}
        {supported === true && enabled && (
          <div className="flex flex-wrap items-center gap-2">
            {passkey.locked && (
              <Button size="sm" disabled={busy} onClick={() => void run(() => unlockWithPasskey(userId))} data-testid="passkey-unlock-now">
                Unlock now
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => unlockWithPasskey(userId))}
              data-testid="passkey-unlock-test"
            >
              Test
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void onDisable()} data-testid="passkey-unlock-disable">
              Turn off
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void onForget()} data-testid="passkey-unlock-forget">
              Forget passkey
            </Button>
            {passkey.locked ? (
              <span className="text-xs text-muted-foreground" data-keep="status" data-testid="passkey-unlock-locked">Locked</span>
            ) : (
              hasPasskeyUnlockedSession(userId) && <span className="text-xs text-muted-foreground">Verified.</span>
            )}
          </div>
        )}
        {message && (
          <p role="status" data-keep="status" className={message.tone === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"} data-testid="passkey-unlock-message">
            {message.text}
          </p>
        )}
      </CardContent>
      <Overlay
        variant="confirm"
        open={confirmCount !== null}
        onClose={() => setConfirmCount(null)}
        title="Turn off passkey unlock"
        message={`${confirmCount ?? 0} unsynced ${confirmCount === 1 ? "change is" : "changes are"} waiting on this device. Turning off passkey unlock needs your confirmation; it does not delete them.`}
        confirmLabel="Turn off"
        onConfirm={() => {
          const n = confirmCount ?? 0;
          setConfirmCount(null);
          void run(() => disablePasskeyUnlock(userId, { unsyncedCount: n, confirmed: true }));
        }}
      />
      <Overlay
        variant="confirm"
        open={forgetCount !== null}
        onClose={() => setForgetCount(null)}
        title="Forget passkey and discard offline copies"
        message={`${forgetCount ?? 0} unsynced ${forgetCount === 1 ? "change" : "changes"} on this device will be discarded, and the offline copy is deleted. Use this only if you have lost the passkey. Everything already synced stays on the server.`}
        confirmLabel="Discard"
        onConfirm={() => {
          setForgetCount(null);
          void run(() => forgetPasskeyAndDiscardOffline(userId));
        }}
      />
    </Card>
  );
}
