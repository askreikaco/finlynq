import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { markStale } from "./nav-state";
import { CHUNK_RELOAD_KEY, CHUNK_GUARD_CLEAR_MS } from "@/components/pwa-register";

const BUILD = import.meta.env.VITE_BUILD as string;
const CHECK_THROTTLE_MS = 60_000;

/**
 * Silent update model (no prompt, no forced reload): on route change (throttled) and when the tab
 * becomes visible, compare /web/version.json with the baked VITE_BUILD. A different build marks the
 * app stale: the NEXT in-app navigation becomes a full page load (new shell, nothing typed is lost).
 * Also: a failed lazy chunk import (a deploy removed it) triggers one guarded silent reload.
 * The SW-based half of this lives in components/pwa-register.tsx (reused as is).
 */
export function VersionWatch() {
  const { pathname } = useLocation();
  const last = useRef(0);

  const check = useRef(() => {
    if (!import.meta.env.PROD) return;
    const now = Date.now();
    if (now - last.current < CHECK_THROTTLE_MS) return;
    last.current = now;
    fetch(`${import.meta.env.BASE_URL}version.json`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ build?: string }>) : null))
      .then((j) => {
        if (j?.build && j.build !== BUILD) markStale();
      })
      .catch(() => undefined);
  });

  useEffect(() => {
    check.current();
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") check.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onPreloadError = (e: Event) => {
      try {
        if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) !== null) return; // already reloaded once: let the error surface
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      } catch {
        return;
      }
      e.preventDefault();
      window.location.reload();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    const t = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // ignore
      }
    }, CHUNK_GUARD_CLEAR_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.clearTimeout(t);
    };
  }, []);

  return null;
}
