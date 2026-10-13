/**
 * GET /api/version — the build id the server is running. The client bundle
 * carries its own copy (NEXT_PUBLIC_APP_BUILD, inlined at build time); when
 * they differ a deploy has happened. Monitoring only; the client updates silently
 * (see components/pwa-register.tsx).
 * Public and read-only: the id is a build timestamp, nothing sensitive.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_APP_BUILD ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
