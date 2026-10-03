import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, NetworkOnly, StaleWhileRevalidate, CacheFirst, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

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
      cacheName: "pages-html-cache",
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
      cacheName: "pages-rsc-cache",
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
