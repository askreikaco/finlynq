"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UnlockPanel, type AutoAttempt, type AutoPasskeyGate } from "@/components/unlock-panel";
import { INVITE_RETURN_PATH, stashInviteFromLocation } from "@/lib/family/invite-stash";
import { getSessionInfo, setSessionInfo } from "@/lib/data/session-info";
import { wipeAll } from "@/lib/data/persist";
import { dropAllLocalCaches, dropLocalUserCache } from "@/lib/data/local-read-cache-wipe";
import { readOfflineIdentity } from "@/lib/data/offline-identity";

/** How long the sign-in check may hang before an Offline-mode device opens from its remembered identity. */
const OFFLINE_BOOT_TIMEOUT_MS = 6000;

/** A failed fetch (no network) or a timeout, as opposed to a server answer we could not parse. */
function looksOffline(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (typeof err === "object" && err !== null && (err as { name?: string }).name === "AbortError") return true;
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

type AuthState = "loading" | "unauthenticated" | "authenticated";

/**
 * Gate around authenticated app pages. If the session is valid we render
 * the children; otherwise we redirect to the login page.
 *
 * The previous self-hosted passphrase/unlock/setup flow was removed when
 * the product became PostgreSQL-only (accounts are provisioned via
 * /register and /cloud login). This component only handles the
 * "am I signed in?" check now.
 */
export function UnlockGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("loading");
  const [locked, setLocked] = useState(false);
  // Sign-in name for the password card (username or email; never logged).
  const [identifier, setIdentifier] = useState<string | null>(null);
  // One automatic passkey attempt per page load (see UnlockPanel).
  const autoAttempt = useRef<AutoAttempt>("idle");
  const autoGate = useMemo<AutoPasskeyGate>(
    () => ({
      state: () => autoAttempt.current,
      set: (next) => {
        autoAttempt.current = next;
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // With Offline mode on, a hanging request (lie-fi) must not strand the app on the spinner: after a few seconds
        // it counts as "no network" and the remembered identity opens the on-device copy.
        const remembered = readOfflineIdentity();
        const res = remembered ? await fetchWithTimeout("/api/auth/session", OFFLINE_BOOT_TIMEOUT_MS) : await fetch("/api/auth/session");
        const data = await res.json();
        if (cancelled) return;
        if (data.authenticated && data.userId) {
          setIdentifier(data.username ?? data.email ?? null);
          setSessionInfo({ userId: String(data.userId), locked: data.encryptionLocked === true });
        } else {
          // signed out: no account's on-device data cache may outlive the session
          setSessionInfo(null);
          void wipeAll().catch(() => undefined);
          void dropAllLocalCaches();
        }
        setState(data.authenticated ? "authenticated" : "unauthenticated");
        if (data.authenticated && data.encryptionLocked === true) setLocked(true);
      } catch (err) {
        if (cancelled) return;
        // No network (and Offline mode remembered who this is): open from the on-device copy. The real check re-runs
        // when the network returns (below). Any other failure is treated as before: not signed in.
        const remembered = looksOffline(err) ? readOfflineIdentity() : null;
        if (remembered) {
          setSessionInfo({ userId: remembered.userId, locked: false, offline: true });
          setState("authenticated");
          return;
        }
        setState("unauthenticated");
      }
    };
    void run();
    // Back online after an offline open: do the real sign-in check now (signed out => the usual wipe + redirect).
    const onOnline = () => {
      if (getSessionInfo()?.offline) void run();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Any same-origin API answering 423 (DEK locked) opens the unlock panel.
  useEffect(() => {
    if (state !== "authenticated") return;
    const orig = window.fetch;
    const wrapped: typeof window.fetch = async (input, init) => {
      const res = await orig(input, init);
      if (res.status === 423) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        const path = url.startsWith("http") ? new URL(url).pathname : url;
        if (path.startsWith("/api/") && !path.startsWith("/api/auth/passkey")) {
          setLocked(true);
          // locked DEK: stop persisting and wipe this user's on-device data cache
          const info = getSessionInfo();
          if (info && !info.locked) {
            setSessionInfo({ ...info, locked: true });
            void dropLocalUserCache(info.userId);
          }
        }
      }
      return res;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = orig;
    };
  }, [state]);

  useEffect(() => {
    if (state !== "unauthenticated") return;
    // Family invite link: stash the token in sessionStorage + strip it from the address bar BEFORE
    // leaving, then return to the token-free path after sign-in (never put the token in a URL).
    const stashed = stashInviteFromLocation();
    router.replace(stashed ? `/cloud?redirect=${encodeURIComponent(INVITE_RETURN_PATH)}` : "/cloud");
  }, [state, router]);

  if (state !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {locked && (
        <UnlockPanel identifier={identifier} autoGate={autoGate} onDismiss={() => setLocked(false)} />
      )}
      {children}
    </>
  );
}
