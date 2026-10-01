"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UnlockPanel } from "@/components/unlock-panel";
import { INVITE_RETURN_PATH, stashInviteFromLocation } from "@/lib/family/invite-stash";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        if (cancelled) return;
        setState(data.authenticated ? "authenticated" : "unauthenticated");
        if (data.authenticated && data.encryptionLocked === true) setLocked(true);
      } catch {
        if (!cancelled) setState("unauthenticated");
      }
    })();
    return () => { cancelled = true; };
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
        if (path.startsWith("/api/") && !path.startsWith("/api/auth/passkey")) setLocked(true);
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {locked && <UnlockPanel onDismiss={() => setLocked(false)} />}
      {children}
    </>
  );
}
