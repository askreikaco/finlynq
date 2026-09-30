/**
 * GET /api/auth/config (public)
 *
 * Returns public authentication configuration.
 *
 * Response: {googleEnabled:boolean}
 */

import { NextRequest, NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/auth/google-oidc";

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    googleEnabled: isGoogleConfigured(),
  });
}
