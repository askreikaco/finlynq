/**
 * Unified session cookie setting logic used by login, register, and zero-click-login routes.
 */

import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

/**
 * Set the pf_session cookie on a NextResponse with standard options:
 * - httpOnly: true (inaccessible to JavaScript)
 * - secure: only in production (HTTPS)
 * - sameSite: "lax" (CSRF mitigation)
 * - maxAge: 24 hours
 * - path: / (site-wide)
 */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });
}
