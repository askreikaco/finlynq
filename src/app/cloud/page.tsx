"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { LogoMark } from "@/components/logo-mark";
import { hardReload } from "@/lib/client/hard-reload";
import {
  safeNext,
  googleStartUrl,
  googleErrorMessage,
} from "@/lib/auth/google-ui";

type Tab = "login" | "register";

// Live availability check is debounced; this is the wait period.
const USERNAME_CHECK_DEBOUNCE_MS = 350;

type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; reason: string };

function CloudAuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "register" ? "register" : "login";
  const redirectTo = safeNext(searchParams.get("redirect") ?? searchParams.get("next"));
  const stepParam = searchParams.get("step");
  const step: "unlock" | "mfa" | null = stepParam === "unlock" || stepParam === "mfa" ? stepParam : null;
  const googleError = searchParams.get("error");
  const googleSignup = searchParams.get("google") === "1" && initialTab === "register";
  // ?demo=1 pre-fills the login form with the published demo credentials so
  // a marketing link can drop users one click away from Sign In. Reuses the
  // normal /api/auth/login path (no auto-submit) so the user explicitly
  // consents to the action. For zero-click full auto-login + redirect, see
  // the /try-demo route.
  const demoPrefill = searchParams.get("demo") === "1";
  const addingAccount = searchParams.get("add") === "1";
  const prefillEmail = searchParams.get("email") || "";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Login form: single 'identifier' field accepts username OR email.
  const [identifier, setIdentifier] = useState(
    prefillEmail || (demoPrefill ? "demo@finlynq.com" : ""),
  );

  // Register form: username (required), email (optional), display name.
  const [username, setUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [acknowledgeNoRecovery, setAcknowledgeNoRecovery] = useState(false);

  const [password, setPassword] = useState(demoPrefill ? "finlynq-demo" : "");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaPendingToken, setMfaPendingToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
  });
  const checkSeqRef = useRef(0);

  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockEmail, setUnlockEmail] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Debounced live check against /api/auth/username-check. We bump a
  // sequence number on each fire so a slow earlier response can't overwrite
  // the result of a later input.
  useEffect(() => {
    if (tab !== "register") {
      setAvailability({ status: "idle" });
      return;
    }
    const value = username.trim();
    if (value.length === 0) {
      setAvailability({ status: "idle" });
      return;
    }
    setAvailability({ status: "checking" });
    const seq = ++checkSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/auth/username-check?u=${encodeURIComponent(value)}`
        );
        const data = await r.json();
        if (seq !== checkSeqRef.current) return;
        if (data.available) {
          setAvailability({ status: "available" });
        } else {
          setAvailability({
            status: "unavailable",
            reason: data.error ?? "Unavailable",
          });
        }
      } catch {
        if (seq !== checkSeqRef.current) return;
        setAvailability({ status: "idle" });
      }
    }, USERNAME_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [username, tab]);

  // Fetch Google config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/auth/config");
        const data = await res.json();
        setGoogleEnabled(data.googleEnabled ?? false);
      } catch {
        setGoogleEnabled(false);
      }
    };
    fetchConfig();
  }, []);

  // Handle query params: step, error, google signup
  useEffect(() => {
    if (step === "mfa") {
      setMfaRequired(true);
    } else if (googleError && googleError.startsWith("google_")) {
      setError(googleErrorMessage(googleError));
      // Strip error from URL
      const qs = new URLSearchParams();
      if (tab === "register") qs.set("tab", "register");
      if (redirectTo !== "/dashboard") qs.set("redirect", redirectTo);
      router.replace(`/cloud${qs.toString() ? `?${qs}` : ""}`);
    }
  }, [step, googleError, tab, redirectTo, router]);

  // Fetch pending Google data for signup prefill
  useEffect(() => {
    if (!googleSignup) return;
    const fetchPending = async () => {
      try {
        const res = await fetch("/api/auth/google/pending");
        if (!res.ok) {
          setError(googleErrorMessage("google_no_state"));
          return;
        }
        const data = await res.json();
        if (data.kind === "signup") {
          setRegisterEmail(data.email ?? "");
          setDisplayName(data.name ?? "");
        }
      } catch {
        setError(googleErrorMessage("google_no_state"));
      }
    };
    fetchPending();
  }, [googleSignup]);

  // Fetch masked email for the unlock step
  useEffect(() => {
    if (step !== "unlock") return;
    (async () => {
      try {
        const res = await fetch("/api/auth/google/pending");
        if (!res.ok) {
          setError(googleErrorMessage("google_no_state"));
          return;
        }
        const data = await res.json();
        if (data.kind === "unlock") setUnlockEmail(data.email ?? "");
      } catch {
        setError(googleErrorMessage("google_no_state"));
      }
    })();
  }, [step]);

  // Focus heading on step change
  useEffect(() => {
    if (step === "unlock" || step === "mfa") {
      headingRef.current?.focus();
    }
  }, [step]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      if (data.mfaRequired) {
        setMfaRequired(true);
        setMfaPendingToken(data.mfaPendingToken);
        return;
      }
      hardReload(redirectTo);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: Record<string, unknown> = { code: mfaCode };
      // Only include mfaPendingToken if it's a non-empty string
      if (mfaPendingToken) {
        body.mfaPendingToken = mfaPendingToken;
      }
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      hardReload(redirectTo);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Last-mile guard. The server enforces this too, but failing fast in the
    // UI avoids a roundtrip and keeps the message inline.
    if (!googleSignup && !registerEmail.trim() && !acknowledgeNoRecovery) {
      setError(
        "Without an email you have no way to recover a forgotten password. Tick the acknowledgement box to proceed."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email: registerEmail.trim() || undefined,
          password,
          displayName: displayName || undefined,
          googleSignup: googleSignup || undefined,
          acknowledgeNoRecovery: !googleSignup && !registerEmail.trim() ? true : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      hardReload(redirectTo);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const usernameHelpId = "username-help";
  const showAck = tab === "register" && !googleSignup && registerEmail.trim().length === 0;
  const submitDisabled =
    loading ||
    (tab === "register" &&
      (availability.status === "checking" ||
        availability.status === "unavailable" ||
        username.trim().length === 0 ||
        (showAck && !acknowledgeNoRecovery) ||
        !password)) ||
    (step === "unlock" && (!unlockPassword || loading));

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: unlockPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setError(
            data.retry
              ? "Wrong password. Try again."
              : "Wrong password. Start over with Google."
          );
        } else if (res.status === 429) {
          setError("Too many attempts. Start over with Google in a few minutes.");
        } else {
          setError(data.error || "Something went wrong. Try again.");
        }
        return;
      }
      if (data.mfaRequired) {
        setMfaPendingToken(data.mfaPendingToken);
        setMfaRequired(true);
        router.replace(`/cloud?step=mfa&redirect=${encodeURIComponent(redirectTo)}`);
      } else {
        hardReload(redirectTo);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dot-pattern ambient-glow">
      <div className="mx-auto w-full max-w-md px-6 py-12">
        {addingAccount && (
          <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                Adding another account — you'll stay signed in.
              </p>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Cancel
              </Link>
            </div>
          </div>
        )}

        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>

        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <span className="[&_svg]:h-9 [&_svg]:w-9">
            <LogoMark />
          </span>
        </div>

        <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
          {tab === "register" ? "Create your free Finlynq account" : "Welcome back"}
        </h1>
        <p className="mb-8 text-muted-foreground">
          {tab === "register"
            ? "Sign up to track your money here and analyze it anywhere. Your data follows you to any device."
            : "Sign in to your account. Your data follows you to any device."}
        </p>
        {tab === "register" && (
          <p className="mb-8 -mt-6 text-xs text-muted-foreground/80">
            Free forever. AGPL v3. Encrypted with your password.
          </p>
        )}

        {step === "unlock" && !mfaRequired ? (
          <form onSubmit={handleUnlock} className="space-y-4">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-base font-semibold text-foreground"
            >
              Confirm your password
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your Finlynq password once to link Google to your account.
            </p>
            {unlockEmail && (
              <p className="text-sm text-foreground" data-testid="unlock-email">
                Google account: {unlockEmail}
              </p>
            )}
            <div>
              <label htmlFor="google-unlock-password" className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="google-unlock-password"
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Your password"
                required
                autoComplete="current-password"
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>
            )}
            <div className="space-y-3">
              <button
                type="submit"
                disabled={!unlockPassword || loading}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Confirm"}
              </button>
              <Link
                href="/cloud"
                className="block text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Use a different method
              </Link>
            </div>
          </form>
        ) : mfaRequired ? (
          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mb-3 text-base font-semibold text-foreground"
              >
                Two-Factor Authentication
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                aria-label="Authentication code"
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        ) : (
          <>
            {demoPrefill && tab === "login" && (
              <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-foreground/90">
                Demo credentials are pre-filled. Just click <strong>Sign In</strong> to
                enter the public demo. Data resets nightly.
              </div>
            )}

            {googleEnabled && step === null && (
              <>
                <a
                  href={googleStartUrl("login", redirectTo)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </a>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 border-t border-border" />
                </div>
              </>
            )}

            {/* Tab switcher */}
            {step === null && (
            <div className="mb-6 flex rounded-xl border border-border bg-muted p-1">
              <button
                onClick={() => { setTab("login"); setError(""); }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === "login"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setTab("register"); setError(""); }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === "register"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create Account
              </button>
            </div>
            )}

            {step === null && (
            <form
              onSubmit={tab === "login" ? handleLogin : handleRegister}
              className="space-y-4"
            >
              {tab === "register" && (
                <>
                  <div>
                    <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-foreground">
                      Display Name
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name (optional)"
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-foreground">
                      Username
                    </label>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. cool-dragon-99 or anon@madeup.fake"
                      required
                      autoComplete="username"
                      aria-describedby={usernameHelpId}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                    <p
                      id={usernameHelpId}
                      className="mt-1.5 text-xs text-muted-foreground/80"
                    >
                      3 to 254 chars. Letters, digits, and{" "}
                      <span className="font-mono">. @ + _ -</span>. Pick something that hides your
                      identity if your data ever leaks.
                    </p>
                    {availability.status === "checking" && (
                      <p className="mt-1 text-xs text-muted-foreground">Checking…</p>
                    )}
                    {availability.status === "available" && (
                      <p className="mt-1 text-xs text-emerald-500">Available</p>
                    )}
                    {availability.status === "unavailable" && (
                      <p className="mt-1 text-xs text-destructive">{availability.reason}</p>
                    )}
                  </div>
                </>
              )}

              {tab === "login" && (
                <div>
                  <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-foreground">
                    Username or email
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="username or you@example.com"
                    required
                    autoComplete="username"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                </div>
              )}

              {tab === "register" && (
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                    Email {!googleSignup && <span className="text-muted-foreground/70 font-normal">(optional)</span>}
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    readOnly={googleSignup}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground/80">
                    {googleSignup
                      ? "From your Google account"
                      : "Used only for password reset. Leave it blank for full zero-knowledge, but then you’ll have no way to recover a forgotten password."
                    }
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === "register" ? "At least 12 characters" : "Your password"}
                  required
                  minLength={tab === "register" ? 12 : 1}
                  autoComplete={tab === "register" ? "new-password" : "current-password"}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {tab === "login" && (
                  <Link
                    href="/auth/forgot-password"
                    prefetch={false}
                    className="mt-1.5 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>

              {showAck && (
                <label className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200/90">
                  <input
                    type="checkbox"
                    checked={acknowledgeNoRecovery}
                    onChange={(e) => setAcknowledgeNoRecovery(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-background accent-primary"
                  />
                  <span>
                    I understand. Finlynq encrypts everything with my password, and there{`’`}s
                    no recovery key. Forgetting it means losing all my data. Without an
                    email I also can{`’`}t reset the password at all.
                  </span>
                </label>
              )}

              {error && (
                <p className="text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitDisabled}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading
                  ? tab === "login" ? "Signing in..." : "Creating account..."
                  : tab === "login" ? "Sign In" : "Create Account"
                }
              </button>
            </form>
            )}

            {step === null && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Just looking?{" "}
              <Link
                href="/try-demo?next=/dashboard"
                prefetch={false}
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
              >
                One-click demo
              </Link>
              . No signup, resets nightly.
            </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CloudAuthPage() {
  return (
    <Suspense>
      <AnalyticsConsent />
      <CloudAuthPageInner />
    </Suspense>
  );
}
