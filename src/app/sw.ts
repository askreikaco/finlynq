import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, NetworkOnly, StaleWhileRevalidate, CacheFirst, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    addEventListener(
      type: "activate",
      listener: (event: { waitUntil(promise: Promise<unknown>): void }) => void,
    ): void;
  }
}

declare const self: WorkerGlobalScope;

/** FNV-1a 32-bit hash, base-36. Deterministic, no node crypto. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// Changes whenever the precache manifest changes (i.e. every build that ships different content).
const BUILD_ID = fnv1a(JSON.stringify(self.__SW_MANIFEST ?? []));

// Page caches are versioned per build so a new deploy never serves the previous build's HTML/RSC.
const STALE_PAGE_CACHE_PREFIXES = ["pages-html-cache", "pages-rsc-cache"];

const runtimeCaching: RuntimeCaching[] = [
  // 1. Critical auth/security and API endpoints must ALWAYS bypass cache
  {
    matcher: ({ url }) => {
      const path = url.pathname;
      return (
        path.startsWith("/api/") ||
        path.startsWith("/auth") ||
        path.startsWith("/unlock") ||
        path.startsWith("/passkey") ||
        path.startsWith("/cloud") ||
        path.startsWith("/oauth")
      );
    },
    handler: new NetworkOnly(),
  },
  // 2. HTML navigation routes — StaleWhileRevalidate for instant initial page opens
  {
    matcher: ({ request, url }) => {
      const isDocument = request.destination === "document" || url.pathname.endsWith(".html");
      const path = url.pathname;
      const isExcluded =
        path.startsWith("/api/") ||
        path.startsWith("/auth") ||
        path.startsWith("/unlock") ||
        path.startsWith("/passkey") ||
        path.startsWith("/cloud") ||
        path.startsWith("/oauth");
      return isDocument && !isExcluded;
    },
    handler: new StaleWhileRevalidate({
      cacheName: `pages-html-cache-${BUILD_ID}`,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
        }),
      ],
    }),
  },
  // 3. Next.js App Router RSC payloads — StaleWhileRevalidate for instant client-side tab/link navigation
  {
    matcher: ({ request, url, sameOrigin }) => {
      if (!sameOrigin) return false;
      const path = url.pathname;
      if (
        path.startsWith("/api/") ||
        path.startsWith("/auth") ||
        path.startsWith("/unlock") ||
        path.startsWith("/passkey") ||
        path.startsWith("/cloud") ||
        path.startsWith("/oauth")
      ) {
        return false;
      }
      return (
        request.headers.get("RSC") === "1" ||
        url.searchParams.has("_rsc") ||
        request.headers.get("Next-Router-Prefetch") === "1"
      );
    },
    handler: new StaleWhileRevalidate({
      cacheName: `pages-rsc-cache-${BUILD_ID}`,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
        }),
      ],
    }),
  },
  // 4. Static assets (_next/static, css, js, worker) — CacheFirst for fast opens
  {
    matcher: ({ request, url }) => {
      return (
        request.destination === "style" ||
        request.destination === "script" ||
        request.destination === "worker" ||
        url.pathname.startsWith("/_next/static/")
      );
    },
    handler: new CacheFirst({
      cacheName: "static-assets-cache",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        }),
      ],
    }),
  },
  // 5. Static media (images, fonts)
  {
    matcher: ({ request }) => {
      return request.destination === "image" || request.destination === "font";
    },
    handler: new CacheFirst({
      cacheName: "static-media-cache",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        }),
      ],
    }),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: runtimeCaching,
});

serwist.addEventListeners();

// Drop page caches written by previous builds.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              STALE_PAGE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
              !key.endsWith(`-${BUILD_ID}`),
          )
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});
