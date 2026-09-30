"use client";

/**
 * /auth/forgot-password — request a password-reset email.
 *
 * Front end for POST /api/auth/password-reset/request, which had no UI.
 * The API always answers with the same generic message (anti-enumeration),
 * so this page does too.
 */

import Link from "next/link";
import { useState } from "react";
import { LogoMark } from "@/components/logo-mark";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setMessage(
          data.message ||
            "If an account with that email exists, a password reset link has been sent.",
        );
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dot-pattern ambient-glow">
      <div className="mx-auto w-full max-w-md px-6 py-12">
        <Link
          href="/cloud"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to sign in
        </Link>

        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <span className="[&_svg]:h-9 [&_svg]:w-9">
            <LogoMark />
          </span>
        </div>

        <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">Forgot password</h1>
        <p className="mb-6 text-muted-foreground">
          Enter the email on your account and we{"’"}ll send a reset link.
        </p>

        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200/90">
          Your data is encrypted with your password and there is no recovery key.
          Resetting the password <strong>erases all data in the account</strong> and
          starts it empty. If you still know your password, change it in Settings →
          Account instead — that keeps your data.
        </div>

        {message ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
            {message}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className={INPUT_CLASS}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading || email.trim().length === 0}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
