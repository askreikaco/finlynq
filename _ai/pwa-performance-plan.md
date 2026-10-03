# PWA & Mobile Performance Fix Plan

**Repository:** `finlynq`  
**Branch:** `custom`  
**Target:** `money.reika.vn`  
**Date:** 2026-10-03  

## 1. Problem Summary
The user reported that `money.reika.vn` is still slow on mobile and asked whether the PWA is working properly.
Investigation revealed four primary root causes:

1. **Missing Web App Manifest link in root layout metadata**:
   - `src/app/layout.tsx` lacked `manifest: "/manifest.webmanifest"` in its `Metadata` export.
   - `src/app/manifest.ts` lacked maskable icon definitions (`purpose: "maskable"`), causing Android/Chrome PWA installability criteria to fail or downgrade to a web shortcut.
   - No static fallback `public/manifest.json` existed for tools/browsers polling `/manifest.json`.

2. **CSP Level 3 Worker-Src Fallback Collision**:
   - Both `next.config.ts` and `src/middleware.ts` defined Content-Security-Policy using `'strict-dynamic'` and per-request nonces in `script-src`, but omitted `worker-src`.
   - In CSP Level 3 browsers (Chrome, Safari), missing `worker-src` falls back to `child-src` and then `script-src`. Because `script-src` requires nonces with `'strict-dynamic'`, external worker scripts like `/sw.js` can be blocked with a CSP SecurityError.
   - Solution: Explicitly declare `worker-src 'self' blob:`.

3. **Missing `Service-Worker-Allowed` & Cache Headers for `/sw.js`**:
   - Middleware intercepts `/sw.js` without providing `Service-Worker-Allowed: /` and `Cache-Control: no-cache, no-store, must-revalidate`.

4. **Slow Mobile Navigation (RSC Payloads defaulting to NetworkFirst)**:
   - Next.js App Router client transitions (tapping tabs or links) fetch React Server Component (RSC) payloads (`RSC: 1` header or `_rsc` query parameter).
   - In `src/app/sw.ts`, RSC requests were not explicitly matched, falling through to `@serwist/next/worker`'s `defaultCache`, which uses `NetworkFirst` with no timeout. On high-latency mobile networks, this causes every page transition to wait for server response.
   - Solution: Cache RSC payloads with `StaleWhileRevalidate` (excluding auth/api routes), delivering 0ms instant mobile page transitions.

5. **Fragile Client-Side Registration**:
   - Webpack chunk entry injection via `@serwist/next`'s `sw-entry.mjs` had `reloadOnOnline: true` enabled by default (causing jarring full-page reloads when mobile networks flicker) and lacked explicit client-side lifecycle management in App Router.
   - Solution: Add a dedicated `"use client"` `PwaRegister` component mounted in `RootLayout`, and configure `reloadOnOnline: false`.

## 2. Implementation Steps
1. Create `_ai/pwa-performance-plan.md`.
2. Update `next.config.ts`:
   - Add `worker-src 'self' blob:` to CSP.
   - Add `/sw.js` headers (`Service-Worker-Allowed: /`, `Cache-Control: no-cache, no-store, must-revalidate`).
   - Add rewrite `/manifest.json` -> `/manifest.webmanifest`.
   - Set `reloadOnOnline: false` in `withSerwistInit`.
3. Update `src/middleware.ts`:
   - Add `worker-src 'self' blob:` to `cspDirectives`.
   - Set `Service-Worker-Allowed` and `Cache-Control` on `/sw.js` responses.
4. Update `src/app/manifest.ts`:
   - Add maskable icon definitions (`purpose: "any"` and `purpose: "maskable"`).
5. Create `public/manifest.json`:
   - Static manifest matching `src/app/manifest.ts`.
6. Create `src/components/pwa-register.tsx`:
   - Robust client-side service worker registration with update detection.
7. Update `src/app/layout.tsx`:
   - Add `manifest: "/manifest.webmanifest"` to `metadata`.
   - Add `formatDetection: { telephone: false }`.
   - Mount `<PwaRegister />` inside `<RootLayout>`.
8. Update `src/app/sw.ts`:
   - Exclude `/cloud`, `/oauth`, `/auth/`, `/api/` from document/RSC caches.
   - Add `StaleWhileRevalidate` rule for App Router RSC payloads (`pages-rsc-cache`).
9. Build and verify:
   - Run `npx next build --webpack` to verify successful compilation and service worker generation.
10. Commit changes to `custom` branch (without pushing).
11. Send status report to parent agent via `send_message`.
