/**
 * GET /api/auth/device-current (requireAuth)
 *
 * Returns the id of this browser's trusted device, parsed from the pf_device
 * cookie ("<id>.<secret>"). Lives under /api/auth/ because pf_device is
 * httpOnly with path=/api/auth and is not sent to other paths. The secret
 * half is never returned.
 *
 * Response: 200 {id: string | null}
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const raw = request.cookies.get("pf_device")?.value;
  const dot = raw ? raw.indexOf(".") : -1;
  const id = raw && dot > 0 ? raw.slice(0, dot) : null;
  return NextResponse.json({ id });
}
