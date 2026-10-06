/**
 * GET /api/admin/instance/config — read-only endpoint returning effective instance configuration.
 *
 * Requires admin authentication. Returns the effective config with sources and masked secrets.
 * WP9a: read-only, environment-only config. WP9b will add database config + write path.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getEffectiveConfig } from "@/lib/admin/effective-config";

export async function GET(request: NextRequest) {
  // Verify admin access before returning any config information
  const adminAuth = await requireAdmin(request);
  if (!adminAuth.authenticated) {
    return adminAuth.response;
  }

  // Get the effective config from environment
  const config = getEffectiveConfig(process.env);

  return NextResponse.json(config);
}

// Reject non-GET methods
export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
