import { NextResponse } from "next/server";
import { createSerwistRoute } from "@serwist/turbopack";

// Turbopack-mode service worker. `@serwist/next` (webpack) cannot run under
// Turbopack, so with USE_TURBOPACK=1 this route bundles src/app/sw.ts with
// esbuild at build time (force-static) and serves it at /serwist/sw.js.
// next.config.ts rewrites the public, already-installed URL /sw.js to it.
//
// In webpack mode (default) the route is inert: no esbuild run, no params, so
// every /serwist/* path 404s and public/sw.js (from @serwist/next) is served.
const turbo = process.env.USE_TURBOPACK === "1";

const route = turbo
  ? createSerwistRoute({ swSrc: "src/app/sw.ts", useNativeEsbuild: true })
  : null;

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;
export const generateStaticParams: () => Promise<{ path: string }[]> =
  route?.generateStaticParams ?? (async () => []);
export const GET: NonNullable<typeof route>["GET"] =
  route?.GET ?? (async () => new NextResponse("Not Found", { status: 404 }));
