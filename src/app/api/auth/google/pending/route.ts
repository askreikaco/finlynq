/**
 * GET /api/auth/google/pending
 *
 * Returns the masked email and kind for a pending Google sign-in.
 * Reads pf_google_signup or pf_google_unlock_data cookies.
 *
 * No authentication required. Returns:
 * - 200 {kind:"signup",email,name?} | {kind:"unlock",email}
 * - 401/404 {error:"No pending Google sign-in"}
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyShortLived } from "@/lib/auth/jwt";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";

export async function GET(request: NextRequest) {
  // Rate limit by IP (like unlock)
  const ip = clientIp(request);
  const rateLimit = checkRateLimit(`google:pending:${ip}`, 10, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Try to read pf_google_signup first (signup flow)
  const signupToken = request.cookies.get("pf_google_signup")?.value;
  if (signupToken) {
    const data = await verifyShortLived(signupToken, "google-signup");
    if (data && typeof data.email === "string") {
      const email = data.email as string;
      const name = typeof data.name === "string" ? data.name : undefined;

      // Mask the email: show first char + domain
      const [localPart, domain] = email.split("@");
      const maskedEmail =
        localPart.length > 1
          ? localPart[0] + "*".repeat(Math.max(1, localPart.length - 1)) + "@" + domain
          : "*@" + domain;

      return NextResponse.json({ kind: "signup", email: maskedEmail, name });
    }
  }

  // Try to read pf_google_unlock_data (unlock flow)
  const unlockToken = request.cookies.get("pf_google_unlock_data")?.value;
  if (unlockToken) {
    const data = await verifyShortLived(unlockToken, "google-unlock-data");
    if (data && typeof data.email === "string") {
      const email = data.email as string;

      // Mask the email: show first char + domain
      const [localPart, domain] = email.split("@");
      const maskedEmail =
        localPart.length > 1
          ? localPart[0] + "*".repeat(Math.max(1, localPart.length - 1)) + "@" + domain
          : "*@" + domain;

      return NextResponse.json({ kind: "unlock", email: maskedEmail });
    }
  }

  return NextResponse.json(
    { error: "No pending Google sign-in" },
    { status: 404 }
  );
}
