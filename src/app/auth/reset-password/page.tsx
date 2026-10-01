"use client";

/**
 * /auth/reset-password?token=… — the page the password-reset email links to
 * (see passwordResetEmail in src/lib/email.ts). Front end for
 * POST /api/auth/password-reset/confirm, which wipes the account's encrypted
 * data and requires the literal confirmation phrase "WIPE".
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LogoMark } from "@/components/logo-mark";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm max-md:h-11 max-md:py-0 max-md:text-base text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const submitDisabled =
    loading ||
    !token ||
    newPassword.length < 12 ||
    newPassword !== confirmPassword ||
    confirmation !== "WIPE";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Reset failed. The link may have expired.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-destructive">
        This reset link is missing its token.{" "}
        <Link href="/auth/forgot-password" className="underline underline-offset-2">
          Request a new link
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 max-md:space-y-3">
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
          Your password has been reset and the account starts empty.
        </p>
        <Link
          href="/cloud"
          className="block w-full rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-md:space-y-3">
      <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-foreground" data-testid="recovery-banner">
        Have a passkey, a recovery code or a trusted device? You can reset your password{" "}
        <strong>without losing data</strong>.{" "}
        <Link href="/auth/forgot-password" className="font-medium underline underline-offset-2">
          Choose another way
        </Link>
      </div>

      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-foreground">
        Resetting <strong>permanently erases all data in this account</strong> —
        accounts, transactions, budgets, everything. Your data is encrypted with
        your old password and cannot be recovered without it.
      </div>

      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium max-md:mb-1 text-foreground">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 12 characters"
          required
          minLength={12}
          autoComplete="new-password"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium max-md:mb-1 text-foreground">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          className={INPUT_CLASS}
        />
        {mismatch && <p className="mt-1 text-xs text-destructive">Passwords don{"’"}t match.</p>}
      </div>

      <div>
        <label htmlFor="confirmation" className="mb-1.5 block text-sm font-medium max-md:mb-1 text-foreground">
          Type <span className="font-mono">WIPE</span> to confirm
        </label>
        <input
          id="confirmation"
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={submitDisabled}
        className="w-full rounded-xl bg-destructive px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
      >
        {loading ? "Resetting..." : "Erase data and reset password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dot-pattern ambient-glow max-md:min-h-[calc(100dvh-var(--sat)-var(--sab))]" data-testid="auth-shell">
      <div className="mx-auto w-full max-w-md px-6 py-12 max-md:px-5 max-md:py-3" data-testid="auth-block">
        <Link
          href="/cloud"
          className="mb-8 inline-flex items-center gap-2 text-sm max-md:mb-2 max-md:text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to sign in
        </Link>

        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 max-md:mb-3 max-md:h-12 max-md:w-12">
          <span className="[&_svg]:h-9 [&_svg]:w-9 max-md:[&_svg]:h-7 max-md:[&_svg]:w-7">
            <LogoMark />
          </span>
        </div>

        <h1 className="mb-6 text-3xl font-bold tracking-tight text-foreground max-md:mb-3 max-md:text-[28px] max-md:font-extrabold">Reset password</h1>

        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
