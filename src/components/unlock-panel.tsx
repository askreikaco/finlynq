"use client";

import { useState } from "react";
import { passkeyLogin } from "@/lib/client/passkey-prf";
import { hardReload } from "@/lib/client/hard-reload";

/**
 * Shown by UnlockGate when the session has no DEK (an API answered 423 or
 * /api/auth/session reported encryptionLocked). Two ways back in:
 *  - passkey: the same PRF sign-in as /cloud (one prompt when this browser
 *    remembers the credential); mints a fresh unlocked session, then a full
 *    reload. Nothing is kept client-side beyond the call.
 *  - password: the existing path, /cloud sign-in returning to this page.
 * trustDevice follows whether THIS browser already holds a trusted-device
 * entry for the user, so unlocking never silently trusts a shared computer
 * (and never revokes an already trusted one).
 */
export function UnlockPanel({ onDismiss }: { onDismiss: () => void }) {
  // Rendered only after the gate's client-side session check, so no SSR mismatch.
  const [supported] = useState(() => typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unlockWithPasskey = async () => {
    setError("");
    setBusy(true);
    try {
      let trust = false;
      try {
        const d = await fetch("/api/auth/device-current");
        const j = await d.json().catch(() => ({}));
        trust = Boolean(j?.id);
      } catch {
        trust = false;
      }
      const r = await passkeyLogin({ trustDevice: trust });
      if (r.ok) {
        hardReload();
        return;
      }
      if (r.code === "prf_unavailable") {
        setError("This passkey can't unlock your data on its own. Use your password instead.");
      } else if (r.code === "failed") {
        setError("Passkey unlock failed. Try again or use your password.");
      }
    } finally {
      setBusy(false);
    }
  };

  const unlockWithPassword = () => {
    const here = `${window.location.pathname}${window.location.search}`;
    hardReload(`/cloud?redirect=${encodeURIComponent(here)}`);
  };

  return (
    <div
      role="alertdialog"
      aria-label="Unlock your data"
      className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 border-b border-amber-500/40 bg-amber-50 px-[max(1rem,var(--sal))] pb-3 pt-[calc(0.75rem+var(--sat))] text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <span>Your data is locked. Unlock it to make changes.</span>
      {supported && (
        <button
          type="button"
          onClick={unlockWithPasskey}
          disabled={busy}
          className="rounded-md bg-amber-600 px-3 py-1 font-medium text-white disabled:opacity-50"
        >
          Unlock with passkey
        </button>
      )}
      <button
        type="button"
        onClick={unlockWithPassword}
        disabled={busy}
        className="rounded-md border border-amber-600 px-3 py-1 font-medium disabled:opacity-50"
      >
        Unlock with password
      </button>
      <button type="button" onClick={onDismiss} className="underline-offset-2 hover:underline">
        Dismiss
      </button>
      {error && (
        <p role="alert" className="w-full text-center text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
