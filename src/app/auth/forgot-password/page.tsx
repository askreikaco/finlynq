"use client";

/**
 * /auth/forgot-password — chooser: passkey, this device, recovery code (all
 * keep your data) and, last, the email reset (ERASES the account's data; the
 * pre-existing POST /api/auth/password-reset/request flow, unchanged).
 */

import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { ForgotPasswordChooser } from "@/components/auth/forgot-password-chooser";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dot-pattern ambient-glow">
      <div className="mx-auto w-full max-w-md px-6 py-12">
        <Link
          href="/cloud"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to sign in
        </Link>

        <div className="mb-6 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <span className="[&_svg]:h-9 [&_svg]:w-9">
            <LogoMark />
          </span>
        </div>

        <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">Forgot password</h1>

        <ForgotPasswordChooser />
      </div>
    </div>
  );
}
