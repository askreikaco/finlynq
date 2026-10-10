"use client";

/**
 * "New version available" prompt. Deploys no longer sign users out (the
 * session generation is pinned in production), so an open tab can keep
 * running an old bundle. Compare the bundle's build id with the server's on
 * load, on tab focus and every 5 minutes; when they differ, show a blocking
 * bar whose only action reloads into the new version.
 *
 * Loop guard: we reload at most once per server build. If the ids still
 * differ after that reload (e.g. a stale CDN copy), the bar stays hidden
 * rather than reloading forever.
 */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const CLIENT_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "";
const CHECK_EVERY_MS = 5 * 60_000;
const RELOADED_KEY = "pf-reloaded-for-build";

export async function fetchServerBuild(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: string | null };
    return typeof body.build === "string" && body.build ? body.build : null;
  } catch {
    return null;
  }
}

export function VersionGate() {
  const [newBuild, setNewBuild] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_BUILD) return;
    let stopped = false;
    const check = async () => {
      const server = await fetchServerBuild();
      if (stopped || !server || server === CLIENT_BUILD) return;
      let already: string | null = null;
      try { already = sessionStorage.getItem(RELOADED_KEY); } catch { /* storage blocked */ }
      if (already === server) return;
      setNewBuild(server);
    };
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!newBuild) return null;

  const update = () => {
    try { sessionStorage.setItem(RELOADED_KEY, newBuild); } catch { /* storage blocked */ }
    window.location.reload();
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="New version available"
      data-testid="version-gate"
      className="fixed inset-x-0 bottom-0 regular:left-[calc(5rem+var(--sal))] z-[70] border-t bg-background px-[max(1rem,var(--sal))] pt-3 pb-[calc(0.75rem+var(--sab))] shadow-[0_-8px_24px_rgba(0,0,0,0.25)]"
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">New version available</p>
          <p className="text-xs text-muted-foreground">Update to continue using Finlynq.</p>
        </div>
        <button
          type="button"
          onClick={update}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Update
        </button>
      </div>
    </div>
  );
}
