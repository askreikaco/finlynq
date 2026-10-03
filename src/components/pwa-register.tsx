"use client";

import { useEffect } from "react";

/**
 * PWA Service Worker Registration & Lifecycle Manager
 *
 * Ensures `/sw.js` is registered on client load in production environments,
 * monitors update events, and activates new service worker updates smoothly.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Listen for new service worker installation
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
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

    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW, { once: true });
      return () => window.removeEventListener("load", registerSW);
    }
  }, []);

  return null;
}
