import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, NetworkOnly, StaleWhileRevalidate, CacheFirst } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url }) => {
      const path = url.pathname;
      return path.startsWith("/api/") || path.startsWith("/auth") || path.startsWith("/unlock") || path.startsWith("/passkey");
    },
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request, url }) => {
      return request.destination === "document" || url.pathname.endsWith(".html");
    },
    handler: new StaleWhileRevalidate({
      cacheName: "pages-html-cache",
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
      },
    }),
  },
  {
    matcher: ({ request, url }) => {
      return request.destination === "style" || request.destination === "script" || request.destination === "worker" || url.pathname.startsWith("/_next/static/");
    },
    handler: new CacheFirst({
      cacheName: "static-assets-cache",
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      },
    }),
  },
  {
    matcher: ({ request }) => {
      return request.destination === "image" || request.destination === "font";
    },
    handler: new CacheFirst({
      cacheName: "static-media-cache",
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      },
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
