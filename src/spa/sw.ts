/**
 * SPA service worker. Derived from src/app/sw.ts minus the Next-specific parts (RSC payload cache,
 * _next/static, HTML SWR, defaultCache). Built by the vite plugin in vite.config.ts (esbuild, iife);
 * the precache manifest + build id + SPA route matchers are injected as defines.
 *
 * - precache: index.html + every hashed asset of the build (revision = null for hashed files).
 * - navigations to SPA routes: the precached /web/index.html (app shell). Other navigations (Next SSR
 *   pages) go straight to the network and are never cached.
 * - /api, /auth, /oauth, ...: NetworkOnly. Images/fonts: CacheFirst.
 * - skipWaiting + clientsClaim; NO forced navigation of open windows on activate (could lose typed input):
 *   the page picks up the new build on its next in-app navigation (components/pwa-register.tsx + version-watch.tsx).
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly, CacheFirst, ExpirationPlugin, NavigationRoute } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {}
}

declare const self: WorkerGlobalScope;
declare const __SW_MANIFEST__: (PrecacheEntry | string)[];
declare const __SPA_MATCHERS__: string[];
declare const __BASE__: string;

/** Regex sources from route-table.ts (same matchers as the in-page isSpaPath; they accept an optional ?query). */
const SPA_PATHS = __SPA_MATCHERS__.map((src) => new RegExp(src));

const NEVER_CACHE = ["/api/", "/auth", "/unlock", "/passkey", "/cloud", "/oauth"];

const serwist = new Serwist({
  precacheEntries: __SW_MANIFEST__,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && NEVER_CACHE.some((p) => url.pathname.startsWith(p)),
      handler: new NetworkOnly(),
    },
    {
      // Lazy route chunks not in the precache: hashed + immutable, cache on first use.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith(`${__BASE__}assets/`),
      handler: new CacheFirst({
        cacheName: "spa-assets-cache",
        plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      matcher: ({ request }) => request.destination === "image" || request.destination === "font",
      handler: new CacheFirst({
        cacheName: "static-media-cache",
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
  ],
});

// App shell for SPA routes only (offline + instant open). Everything else falls through to the network.
serwist.registerRoute(
  new NavigationRoute(async () => (await serwist.matchPrecache(`${__BASE__}index.html`)) ?? Response.error(), {
    allowlist: SPA_PATHS,
  }),
);

serwist.addEventListeners();
