/**
 * GET /api/auth/device-current (requireAuth)
 *
 * Returns the id of this browser's trusted device, parsed from the pf_device
 * cookie ("<id>.<secret>[,<id>.<secret>...]"). Lives under /api/auth/ because pf_device is
 * httpOnly with path=/api/auth and is not sent to other paths. The secret
 * half is never returned.
 *
 * Response: 200 {id: string | null}
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { findUserDeviceId } from "@/lib/auth/trusted-device";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  // pf_device is a per-user list: report the entry owned by the signed-in user.
  const raw = request.cookies.get("pf_device")?.value;
  const id = auth.context.userId && raw ? (await findUserDeviceId(raw, auth.context.userId)) ?? null : null;
  return NextResponse.json({ id });
}
