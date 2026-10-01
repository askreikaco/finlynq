/**
 * POST /api/auth/identify — Check if an email or username exists
 * (managed edition only).
 *
 * Supports identifier-first flows: returns { exists: boolean } to determine
 * whether to show sign-in or sign-up next.
 *
 * Returns ONLY { exists: boolean } — no names, no methods, no user data.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { isIdentifierClaimed } from "@/lib/auth/queries";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";

const identifySchema = z
  .object({
    identifier: z.string().min(1, "Identifier is required").max(254),
  })
  .transform((v) => ({
    identifier: v.identifier.trim().toLowerCase(),
  }))
  .refine((v) => v.identifier.length > 0, {
    message: "Identifier is required",
    path: ["identifier"],
  });

export async function POST(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Account identification is only available in managed mode." },
      { status: 403 }
    );
  }

  // Rate limit: 10 attempts per 60 seconds per IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipLimit = checkRateLimit(`identify:${ip}`, 10, 60_000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((ipLimit.resetAt - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = validateBody(body, identifySchema);
    if (parsed.error) return parsed.error;

    const { identifier } = parsed.data;

    // Check if the identifier (email or username) exists
    const exists = await isIdentifierClaimed(identifier);

    // Return ONLY { exists: boolean }
    return NextResponse.json({ exists });
  } catch (err) {
    await logApiError("POST", "/api/auth/identify", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
