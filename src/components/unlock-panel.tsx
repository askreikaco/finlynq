"use client";

import { useEffect, useState, type FormEvent } from "react";
import { isWebAuthnPending, passkeyLogin } from "@/lib/client/passkey-prf";
import { hardReload } from "@/lib/client/hard-reload";

/**
 * Shown by UnlockGate when the session has no DEK (an API answered 423 or
 * /api/auth/session reported encryptionLocked). No banner, no Dismiss button.
 *
 *  1. Auto passkey: if this user has a PRF-capable passkey, the passkey prompt
 *     starts ONCE per page load (gate-owned `autoTried` ref). Nothing shows
 *     while it runs.
 *  2. Password card: shown when there is no passkey, or the auto attempt was
 *     cancelled/failed/unsupported. One password field + Unlock. A "Use passkey"
 *     text button appears under it only when the user has a PRF passkey (manual
 *     path; iOS Safari needs a user gesture for WebAuthn).
 *  3. Escape hides the card. It returns on the next locked action (423). Auto
 *     never re-runs on a page load.
 *
 * Passkey success and password success both call hardReload() (full reload, so
 * every cache refetches). Password uses POST /api/auth/login (server rate limits
 * unchanged). MFA accounts are sent to /cloud to finish sign-in.
 * trustDevice follows whether THIS browser already holds a trusted-device entry,
 * so unlocking never silently trusts a shared computer (and never revokes one).
 */

export type AutoAttempt = "idle" | "running" | "done";
/** Page-load-scoped record of the automatic attempt (state lives in UnlockGate). */
export type AutoPasskeyGate = { state: () => AutoAttempt; set: (next: AutoAttempt) => void };

type Props = {
  identifier: string | null;
  /** Owned by UnlockGate: one auto passkey attempt per page load. */
  autoGate: AutoPasskeyGate;
  onDismiss: () => void;
};

async function resolveTrust(): Promise<boolean> {
  try {
    const d = await fetch("/api/auth/device-current");
    const j = await d.json().catch(() => ({}));
    return Boolean(j?.id);
  } catch {
    return false;
  }
}

/** True only when the signed-in user has at least one passkey that can unlock on its own (PRF). */
async function userHasPrfPasskey(): Promise<boolean> {
  try {
    const r = await fetch("/api/settings/passkeys");
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({}));
    return Array.isArray(j?.passkeys) && j.passkeys.some((p: { prfSupported?: unknown }) => p?.prfSupported === true);
  } catch {
    return false;
  }
}

function redirectToSignIn() {
  const here = `${window.location.pathname}${window.location.search}`;
  hardReload(`/cloud?redirect=${encodeURIComponent(here)}`);
}

export function UnlockPanel({ identifier, autoGate, onDismiss }: Props) {
  // Rendered only after the gate's client-side session check, so no SSR mismatch.
  const [supported] = useState(() => typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined");
  const [phase, setPhase] = useState<"checking" | "password">("checking");
  const [hasPasskey, setHasPasskey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  // Auto passkey, at most once per page load (autoGate lives in UnlockGate).
  // No cancel flag: a started attempt always finishes and settles the UI. A second
  // run (StrictMode) sees "running" and leaves the phase to the first run.
  useEffect(() => {
    (async () => {
      const has = supported ? await userHasPrfPasskey() : false;
      setHasPasskey(has);
      if (!has || isWebAuthnPending()) {
        setPhase("password");
        return;
      }
      if (autoGate.state() === "running") return;
      if (autoGate.state() === "done") {
        setPhase("password");
        return;
      }
      autoGate.set("running");
      setBusy(true);
      try {
        const r = await passkeyLogin({ trustDevice: await resolveTrust() });
        if (r.ok) {
          hardReload();
          return;
        }
        // Cancel is silent; failure and prf_unavailable fall through to the password card.
        if (r.code === "prf_unavailable") setError("This passkey can't unlock on its own. Enter your password.");
        else if (r.code === "failed") setError("Passkey unlock failed. Enter your password.");
      } catch {
        setError("Passkey unlock failed. Enter your password.");
      } finally {
        autoGate.set("done");
        setBusy(false);
        setPhase("password");
      }
    })();
    // Runs once per mount; autoGate guards re-runs across mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape hides the card (see header comment for when it returns).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const usePasskey = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await passkeyLogin({ trustDevice: await resolveTrust() });
      if (r.ok) {
        hardReload();
        return;
      }
      if (r.code === "prf_unavailable") setError("This passkey can't unlock on its own. Enter your password.");
      else if (r.code === "failed") setError("Passkey unlock failed. Try again or enter your password.");
    } catch {
      setError("Passkey unlock failed. Try again or enter your password.");
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || password === "") return;
    if (!identifier) {
      redirectToSignIn();
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, trustDevice: await resolveTrust() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.mfaRequired) {
        redirectToSignIn();
        return;
      }
      if (res.ok) {
        hardReload();
        return;
      }
      if (res.status === 429) setError(typeof data?.error === "string" ? data.error : "Too many attempts. Try again later.");
      else if (res.status === 401) setError("Password is incorrect.");
      else setError("Could not unlock. Try again.");
      setPassword("");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "checking") return null;

  return (
    <div
      role="dialog"
      aria-label="Unlock your data"
      className="fixed inset-x-0 bottom-[max(var(--kb-inset,0px),var(--mobile-bar-clearance))] z-50 px-[max(1rem,var(--sal))] regular:left-[calc(5rem+var(--sal))] regular:right-auto regular:bottom-6 regular:w-[24rem] regular:px-0"
    >
      <form
        onSubmit={submitPassword}
        className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-xl border border-border bg-background p-4 text-foreground shadow-lg regular:mx-0"
      >
        {identifier && (
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={identifier}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
        )}
        <label htmlFor="unlock-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="unlock-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "unlock-error" : undefined}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        {error && (
          <p id="unlock-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || password === ""}
          className="h-11 w-full rounded-lg bg-primary font-medium text-primary-foreground disabled:opacity-50"
        >
          Unlock
        </button>
        {hasPasskey && supported && (
          <button
            type="button"
            onClick={usePasskey}
            disabled={busy}
            className="min-h-11 self-center px-2 text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            Use passkey
          </button>
        )}
      </form>
    </div>
  );
}
