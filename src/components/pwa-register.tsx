"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Minimum gap between registration.update() calls triggered by navigation. */
export const UPDATE_THROTTLE_MS = 60_000;
export const CHUNK_RELOAD_KEY = "pwa-chunk-reload-at";
/** The chunk-reload guard is cleared after this long of stable page life. */
export const CHUNK_GUARD_CLEAR_MS = 60_000;

const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk [^\s]+ failed|Loading CSS chunk [^\s]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export function isChunkLoadError(reason: unknown): boolean {
  if (!reason) return false;
  if (typeof reason === "string") return CHUNK_ERROR_RE.test(reason);
  const r = reason as { name?: unknown; message?: unknown };
  const name = typeof r.name === "string" ? r.name : "";
  const message = typeof r.message === "string" ? r.message : "";
  return CHUNK_ERROR_RE.test(name) || CHUNK_ERROR_RE.test(message);
}

/** Link click that the browser would handle as a plain same-tab navigation. */
function plainLinkTarget(e: MouseEvent): string | null {
  
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement)) return null;
  if (a.target && a.target !== "_self") return null;
  if (a.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(a.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // Same-document hash jumps are not navigations.
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash !== ""
  ) {
    return null;
  }
  return url.href;
}

/**
 * PWA Service Worker Registration & Silent Update Manager
 *
 * Registers `/sw.js` in production. No prompt, no forced reload: when a new service worker
 * is found (or takes control), a flag is set and the NEXT in-app navigation becomes a full
 * page load, so the user gets the new code without losing in-progress input. The registration
 * is re-checked on route changes (throttled) and when the tab becomes visible. A chunk load
 * failure (a deploy removed an old chunk) triggers one guarded silent reload.
 */
export function PwaRegister() {
  const pathname = usePathname();
  const requestUpdate = useRef<(() => void) | null>(null);

  // Route change: ask the browser to re-check /sw.js (throttled inside requestUpdate).
  useEffect(() => {
    requestUpdate.current?.();
  }, [pathname]);

  useEffect(() => {
    // Service worker is only built in production (next.config.ts withSerwist). Skip in dev to avoid registration errors.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const container = navigator.serviceWorker;
    // A controller present at load means this page is an update target, not a first install.
    const hadController = container.controller !== null;
    let registration: ServiceWorkerRegistration | null = null;
    let lastUpdateAt = 0;
    let updateAvailable = false;

    const markUpdateAvailable = () => {
      updateAvailable = true;
    };

    const onControllerChange = () => {
      if (hadController) markUpdateAvailable();
    };
    container.addEventListener("controllerchange", onControllerChange);

    const update = () => {
      if (!registration) return;
      const now = Date.now();
      if (now - lastUpdateAt < UPDATE_THROTTLE_MS) return;
      lastUpdateAt = now;
      try {
        void Promise.resolve(registration.update()).catch(() => undefined);
      } catch {
        // update() can throw on a redundant registration; ignore.
      }
    };
    requestUpdate.current = update;

    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Next in-app navigation after an update becomes a full page load.
    const goFull = (href: string) => {
      updateAvailable = false;
      window.location.assign(href);
    };
    const onClick = (e: MouseEvent) => {
      if (!updateAvailable) return;
      const href = plainLinkTarget(e);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      goFull(href);
    };
    document.addEventListener("click", onClick, true);

    const history = window.history;
    const originalPushState = history.pushState;
    const wrap =
      (original: History["pushState"]): History["pushState"] =>
      function (this: History, data, unused, url) {
        if (updateAvailable && url != null) {
          try {
            const target = new URL(String(url), window.location.href);
            const here = new URL(window.location.href);
            if (target.origin === here.origin && target.pathname !== here.pathname) {
              goFull(target.href);
              return;
            }
          } catch {
            // fall through to the normal transition
          }
        }
        return original.call(this, data, unused, url);
      };
    history.pushState = wrap(originalPushState);

    // Chunk-load recovery: one silent reload, guarded against loops.
    const readGuard = (): boolean => {
      try {
        return window.sessionStorage.getItem(CHUNK_RELOAD_KEY) !== null;
      } catch {
        return true; // cannot guard -> do not risk a loop
      }
    };
    const onChunkFailure = (reason: unknown) => {
      if (!isChunkLoadError(reason)) return;
      if (readGuard()) return;
      try {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      } catch {
        return;
      }
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => onChunkFailure(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => onChunkFailure(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const guardTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // ignore
      }
    }, CHUNK_GUARD_CLEAR_MS);

    const registerSW = async () => {
      try {
        const reg = await container.register("/sw.js", {
          scope: "/",
        });
        registration = reg;

        reg.addEventListener("updatefound", () => {
          const installingWorker = reg.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && container.controller) {
              markUpdateAvailable();
            }
          });
        });
      } catch (err) {
        console.warn("[PWA] Service worker registration error:", err);
      }
    };

    const onLoad = () => {
      registerSW();
    };

    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      container.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearTimeout(guardTimer);
      history.pushState = originalPushState;
      requestUpdate.current = null;
    };
  }, []);

  return null;
}
