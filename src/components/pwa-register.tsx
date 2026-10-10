"use client";

import { useEffect } from "react";

const RELOAD_GUARD_KEY = "pwa-update-reloaded-at";
const RELOAD_COOLDOWN_MS = 60_000;

// Module-level guard: never reload more than once per page load.
let reloadedThisPage = false;

function readLastReloadAt(): number {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastReloadAt(timestamp: number): void {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(timestamp));
  } catch {
    // Storage unavailable: the module-level flag still prevents a loop.
  }
}

/** True while the user is typing in a field or a dialog is open. */
function isUserBusy(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLElement) {
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) {
      return true;
    }
  }
  return document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]') !== null;
}

/** Reloads the page at most once per page load and once per cooldown window. */
function reloadOnce(): boolean {
  if (reloadedThisPage) return false;
  const now = Date.now();
  if (now - readLastReloadAt() < RELOAD_COOLDOWN_MS) return false;
  reloadedThisPage = true;
  writeLastReloadAt(now);
  window.location.reload();
  return true;
}

/**
 * PWA Service Worker Registration & Lifecycle Manager
 *
 * Ensures `/sw.js` is registered on client load in production environments,
 * monitors update events, and reloads an already-open page once when a new
 * service worker takes control (an update, not the first install).
 */
export function PwaRegister() {
  useEffect(() => {
    // Service worker is only built in production (next.config.ts withSerwist). Skip in dev to avoid registration errors.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const container = navigator.serviceWorker;
    // A controller present at load means this page is an update target, not a first install.
    const hadController = container.controller !== null;
    let deferredReload: (() => void) | null = null;

    const removeDeferredReload = () => {
      if (deferredReload) {
        document.removeEventListener("visibilitychange", deferredReload);
        deferredReload = null;
      }
    };

    const onControllerChange = () => {
      if (!hadController) return;
      if (!isUserBusy()) {
        reloadOnce();
        return;
      }
      // Don't interrupt typing or an open dialog: reload when the tab is hidden instead.
      if (deferredReload) return;
      deferredReload = () => {
        if (document.visibilityState !== "hidden") return;
        removeDeferredReload();
        reloadOnce();
      };
      document.addEventListener("visibilitychange", deferredReload);
    };

    container.addEventListener("controllerchange", onControllerChange);

    const registerSW = async () => {
      try {
        const registration = await container.register("/sw.js", {
          scope: "/",
        });

        // Listen for new service worker installation
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              container.controller
            ) {
              // New content is available and will be used when tabs are updated
              console.log("[PWA] Service worker update available.");
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
      removeDeferredReload();
    };
  }, []);

  return null;
}
