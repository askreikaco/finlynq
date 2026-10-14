/**
 * GET /api/config/flags - runtime env flags the SPA shell needs at boot.
 * Replaces the props the server wrapper pages/layouts passed down (FINLYNQ_CATEGORIES_MERGED,
 * FINLYNQ_INSTANCE_ADMIN). Read per request (runtime env, not inlined at build).
 * Public and read-only: booleans only, nothing sensitive (the same values already shape the
 * server-rendered nav). Add new flags here, never read process.env in SPA code.
 */
import { NextResponse } from "next/server";
import { isCategoriesMergedEnabled } from "@/lib/categories/flag";
import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      categoriesMerged: isCategoriesMergedEnabled(),
      instanceAdmin: isInstanceAdminEnabled(),
      // API build id (monitoring); the SPA compares its own VITE_BUILD with /web/version.json instead.
      apiBuild: process.env.NEXT_PUBLIC_APP_BUILD ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
