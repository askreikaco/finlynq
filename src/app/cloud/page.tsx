"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { LogoMark } from "@/components/logo-mark";
import { hardReload } from "@/lib/client/hard-reload";
import { passkeyLogin, getAssertionWithPrf } from "@/lib/client/passkey-prf";
import {
  safeNext,
  googleStartUrl,
  googleErrorMessage,
} from "@/lib/auth/google-ui";

type FlowStep = "identify" | "signin" | "signup";
type Screen = "options" | "email";

const USERNAME_CHECK_DEBOUNCE_MS = 350;

type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; reason: string };

function CloudAuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeNext(searchParams.get("redirect") ?? searchParams.get("next"));
  const stepParam = searchParams.get("step");
  const step: "unlock" | "mfa" | null = stepParam === "unlock" || stepParam === "mfa" ? stepParam : null;
  const googleError = searchParams.get("error");
  const googleSignup = searchParams.get("google") === "1";
  const demoPrefill = searchParams.get("demo") === "1";
  const addingAccount = searchParams.get("add") === "1";
  const prefillEmail = (searchParams.get("email") || "").slice(0, 254);
  const modeParam = searchParams.get("mode");
  const tabParam = searchParams.get("tab");

  const [stayEmail, setStayEmail] = useState<string | null>(null);

  // Determine if email flow should open by default
  const shouldOpenEmailByDefault = Boolean(
    prefillEmail ||
    modeParam === "signup" ||
    tabParam === "create" ||
    (googleError && googleError.startsWith("google_"))
  );

  // Screen state
  const [screen, setScreen] = useState<Screen>(shouldOpenEmailByDefault ? "email" : "options");

  // Email flow step
  const [flowStep, setFlowStep] = useState<FlowStep>("identify");

  // Identifier field (email or username)
  const [identifier, setIdentifier] = useState(prefillEmail || "");

  // Sign in: password only
  const [password, setPassword] = useState(demoPrefill ? "finlynq-demo" : "");

  // Sign up: password, confirm, display name, and email
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [acknowledgeNoRecovery, setAcknowledgeNoRecovery] = useState(false);

  // Error & loading
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // MFA
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaPendingToken, setMfaPendingToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMode, setMfaMode] = useState<"totp" | "recovery">("totp");
  const [recoveryCode, setRecoveryCode] = useState("");

  // Shared computer
  const [sharedComputer, setSharedComputer] = useState(false);

  // Passkey support
  const [passkeySupported, setPasskeySupported] = useState(false);

  // Availability check
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
  });
  const checkSeqRef = useRef(0);

  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockEmail, setUnlockEmail] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [signupDisabled, setSignupDisabled] = useState(false);
  const passkeyAutoAttemptedRef = useRef(false);

  // Check if identifier is email
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

  // Add-account mode
  useEffect(() => {
    if (!addingAccount) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/accounts");
        if (!res.ok) return;
        const list = await res.json();
        const active = Array.isArray(list) ? list.find((a: { active?: boolean }) => a?.active) : null;
        if (!cancelled && active && typeof active.email === "string") setStayEmail(active.email);
      } catch {
        // no banner without a known active account
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addingAccount]);

  // Cancel the add flow
  const cancelAdd = async () => {
    try {
      await fetch("/api/auth/add-intent", { method: "DELETE" });
    } catch {
      // navigate anyway; pf_add expires in 10 min
    }
    hardReload("/dashboard");
  };

  // Passkeys feature detection
  useEffect(() => {
    setPasskeySupported(typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined");
  }, []);

  // Fetch config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/auth/config");
        const data = await res.json();
        setGoogleEnabled(data.googleEnabled ?? false);
        setSignupDisabled(data.signupDisabled ?? false);
      } catch {
        setGoogleEnabled(false);
      }
    };
    fetchConfig();
  }, []);

  // Auto passkey for returning users
  useEffect(() => {
    // Skip if:
    // - already attempted
    // - on options screen (will be triggered by button instead)
    // - has google error/signup intent/add-account intent
    // - skip flag is set
    if (
      passkeyAutoAttemptedRef.current ||
      screen === "options" ||
      googleError ||
      modeParam === "signup" ||
      tabParam === "create" ||
      addingAccount
    ) {
      return;
    }

    let cancelled = false;

    const attemptAutoPasskey = async () => {
      try {
        const skipFlag = localStorage.getItem("pf-passkey-auto-skip");
        if (skipFlag === "1") return;

        const hint = localStorage.getItem("pf-passkey-hint");
        if (hint !== "1") return;

        if (typeof window === "undefined" || !window.PublicKeyCredential) return;

        passkeyAutoAttemptedRef.current = true;

        setLoading(true);
        const r = await passkeyLogin({ trustDevice: !sharedComputer });
        if (!cancelled) {
          if (r.ok) {
            hardReload(redirectTo);
            return;
          }
          if (r.code === "prf_unavailable") {
            setError("This passkey can't unlock your data on its own. Enter your password to continue.");
            document.getElementById("password")?.focus();
          }
          // On error or cancel, set skip flag and fall back to normal screen
          try {
            localStorage.setItem("pf-passkey-auto-skip", "1");
          } catch {}
          setScreen("options");
        }
      } catch (err) {
        if (!cancelled) {
          const name = (err as { name?: string })?.name;
          // Silently fall back on NotAllowedError (no user gesture)
          if (name !== "NotAllowedError" && name !== "AbortError") {
            setError("Passkey sign-in failed.");
          }
          try {
            localStorage.setItem("pf-passkey-auto-skip", "1");
          } catch {}
          setScreen("options");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    attemptAutoPasskey();
    return () => {
      cancelled = true;
    };
  }, [screen, googleError, modeParam, tabParam, addingAccount, redirectTo, sharedComputer]);

  // Handle query params: step, error, google signup
  useEffect(() => {
    if (step === "mfa") {
      setMfaRequired(true);
    } else if (googleError && googleError.startsWith("google_")) {
      setError(googleErrorMessage(googleError));
      // Strip error from URL
      const qs = new URLSearchParams();
      if (redirectTo !== "/dashboard") qs.set("redirect", redirectTo);
      router.replace(`/cloud${qs.toString() ? `?${qs}` : ""}`);
    }
  }, [step, googleError, redirectTo, router]);

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
          setIdentifier(data.email ?? "");
          setSignupEmail(data.email ?? "");
          setDisplayName(data.name ?? "");
          setFlowStep("signup");
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

  // Handle identify: check if email/username exists
  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!identifier.trim()) {
      setError("Please enter an email or username");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        return;
      }

      const data = await res.json();
      if (data.exists) {
        setFlowStep("signin");
      } else {
        if (isEmail) {
          setSignupEmail(identifier.trim());
          setFlowStep("signup");
        } else {
          setError("No account with that username. Use your email to create one.");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, ...(sharedComputer ? { trustDevice: false } : {}) }),
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
      try {
        localStorage.setItem("pf-passkey-hint", "1");
      } catch {}
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
      const recovery = mfaMode === "recovery";
      const body: Record<string, unknown> = {
        code: recovery ? recoveryCode.trim() : mfaCode,
        ...(sharedComputer ? { trustDevice: false } : {}),
      };
      if (mfaPendingToken) {
        body.mfaPendingToken = mfaPendingToken;
      }
      const res = await fetch(recovery ? "/api/auth/mfa/recovery/verify" : "/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      try {
        localStorage.setItem("pf-passkey-hint", "1");
      } catch {}
      hardReload(redirectTo);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 2FA step: passkey assertion
  const handleMfaPasskey = async () => {
    setError("");
    setLoading(true);
    try {
      const pending = mfaPendingToken ? { mfaPendingToken } : {};
      const optRes = await fetch("/api/auth/mfa/webauthn/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const opt = await optRes.json().catch(() => ({}));
      if (!optRes.ok) {
        setError(opt.error || "Passkey verification failed.");
        return;
      }
      const assertion = await getAssertionWithPrf(opt.options, null);
      const res = await fetch("/api/auth/mfa/webauthn/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pending,
          token: opt.token,
          response: assertion.response,
          ...(sharedComputer ? { trustDevice: false } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Passkey verification failed.");
        return;
      }
      try {
        localStorage.setItem("pf-passkey-hint", "1");
      } catch {}
      hardReload(redirectTo);
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setError("Passkey verification failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Sign in with a passkey (no password).
  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const r = await passkeyLogin({ trustDevice: !sharedComputer });
      if (r.ok) {
        try {
          localStorage.setItem("pf-passkey-hint", "1");
        } catch {}
        hardReload(redirectTo);
        return;
      }
      if (r.code === "prf_unavailable") {
        setError("This passkey can't unlock your data on its own. Enter your password to continue.");
        setScreen("email");
        setFlowStep("signin");
        document.getElementById("signin-password")?.focus();
      } else if (r.code === "cancelled") {
        // Silent - user cancelled the prompt
      } else if (r.code === "failed") {
        setError("Passkey sign-in failed. Try again or use your password.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (signupPassword !== signupConfirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!googleSignup && !signupEmail.trim() && !acknowledgeNoRecovery) {
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
          username: identifier,
          email: signupEmail.trim() || undefined,
          password: signupPassword,
          displayName: displayName || undefined,
          googleSignup: googleSignup || undefined,
          acknowledgeNoRecovery: !googleSignup && !signupEmail.trim() ? true : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      try {
        localStorage.setItem("pf-passkey-hint", "1");
      } catch {}
      hardReload(redirectTo);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
        try {
          localStorage.setItem("pf-passkey-hint", "1");
        } catch {}
        hardReload(redirectTo);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const passwordInputId = flowStep === "signin" ? "signin-password" : "signup-password";

  return (
    <div className="flex min-h-screen items-center justify-center bg-dot-pattern ambient-glow" style={{ paddingTop: "max(var(--sat, 0px), 1rem)", paddingBottom: "max(var(--sab, 0px), 1rem)" }}>
      <div className="mx-auto w-full max-w-sm px-6 py-12 flex flex-col items-center justify-center">
        {addingAccount && stayEmail && (
          <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 w-full">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-blue-600 dark:text-blue-400 min-w-0 break-words">
                Adding another account — you&apos;ll stay signed in as {stayEmail}
              </p>
              <button
                type="button"
                data-testid="add-cancel"
                onClick={cancelAdd}
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <span className="[&_svg]:h-9 [&_svg]:w-9">
            <LogoMark />
          </span>
        </div>

        <h1 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground">
          {flowStep === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-8 text-center text-muted-foreground">
          {flowStep === "signup"
            ? "Sign up to track your money here and analyze it anywhere. Your data follows you to any device."
            : "Sign in to your account. Your data follows you to any device."}
        </p>

        {step === "unlock" && !mfaRequired ? (
          <form onSubmit={handleUnlock} className="space-y-4 w-full">
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
              <input
                id="google-unlock-password"
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="current-password"
                autoFocus
                aria-label="Password"
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
          <form onSubmit={handleMfaVerify} className="space-y-4 w-full">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mb-3 text-base font-semibold text-foreground"
              >
                Two-Factor Authentication
              </h2>
              {mfaMode === "totp" ? (
                <>
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
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Enter one of your recovery codes. Each code works once.
                  </p>
                  <input
                    type="text"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-\s]/g, ""))}
                    placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                    aria-label="Recovery code"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center font-mono text-base tracking-wider text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                </>
              )}
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || (mfaMode === "totp" ? mfaCode.length !== 6 : recoveryCode.replace(/[^A-Z0-9]/g, "").length < 20)}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
            <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={sharedComputer}
                onChange={(e) => setSharedComputer(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-background accent-primary"
              />
              This is a shared computer
            </label>
            <div className="flex flex-col items-center gap-2 text-sm">
              {passkeySupported && (
                <button
                  type="button"
                  onClick={handleMfaPasskey}
                  disabled={loading}
                  className="text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                >
                  Use a passkey
                </button>
              )}
              <button
                type="button"
                onClick={() => { setMfaMode(mfaMode === "totp" ? "recovery" : "totp"); setError(""); }}
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {mfaMode === "totp" ? "Use a recovery code" : "Use an authenticator code"}
              </button>
            </div>
          </form>
        ) : screen === "options" ? (
          // Default options screen
          <>
            {googleEnabled && (
              <a
                href={googleStartUrl("login", redirectTo)}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </a>
            )}

            {passkeySupported && (
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={loading}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {loading ? "Signing in..." : "Sign in with a passkey"}
              </button>
            )}

            <label className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={sharedComputer}
                onChange={(e) => setSharedComputer(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-background accent-primary"
              />
              This is a shared computer
            </label>

            {error && (
              <p className="mb-4 text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>
            )}

            <button
              type="button"
              onClick={() => setScreen("email")}
              className="text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Use email instead
            </button>

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
          </>
        ) : (
          // Email flow screen
          <>
            {/* Identify step */}
            {flowStep === "identify" && (
              <form onSubmit={handleIdentify} className="space-y-4 w-full">
                <div>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Email or username"
                    required
                    autoComplete="username"
                    aria-label="Email or username"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !identifier.trim()}
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? "Checking..." : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScreen("options");
                    setFlowStep("identify");
                    setIdentifier("");
                    setError("");
                  }}
                  className="w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Back to sign-in options
                </button>
              </form>
            )}

            {/* Sign in step */}
            {flowStep === "signin" && (
              <form onSubmit={handleLogin} className="space-y-4 w-full">
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <span className="text-xs font-medium text-foreground truncate flex-1">{identifier}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFlowStep("identify");
                      setPassword("");
                      setError("");
                    }}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground whitespace-nowrap"
                  >
                    Change
                  </button>
                </div>
                <div>
                  <input
                    id={passwordInputId}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    autoComplete="current-password"
                    aria-label="Password"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <Link
                    href="/auth/forgot-password"
                    prefetch={false}
                    className="mt-1.5 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Forgot password?
                  </Link>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={sharedComputer}
                    onChange={(e) => setSharedComputer(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-background accent-primary"
                  />
                  This is a shared computer
                </label>
                {error && (
                  <p className="text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            )}

            {/* Sign up step */}
            {flowStep === "signup" && (
              <form onSubmit={handleRegister} className="space-y-4 w-full">
                {signupDisabled ? (
                  <p className="text-sm text-destructive">Sign-up is currently disabled.</p>
                ) : (
                  <>
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                      <span className="text-xs font-medium text-foreground truncate flex-1">{identifier}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFlowStep("identify");
                          setSignupPassword("");
                          setSignupConfirmPassword("");
                          setSignupEmail("");
                          setDisplayName("");
                          setError("");
                        }}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground whitespace-nowrap"
                      >
                        Change
                      </button>
                    </div>

                    {isEmail && (
                      <div>
                        <input
                          id="signup-email"
                          type="email"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                          aria-label="Email"
                          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground/80">
                          Used only for password reset. Leave it blank for full zero-knowledge, but then you&apos;ll have no way to recover a forgotten password.
                        </p>
                      </div>
                    )}

                    <div>
                      <input
                        id={passwordInputId}
                        type="password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="At least 12 characters"
                        required
                        minLength={12}
                        autoComplete="new-password"
                        aria-label="Password"
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                    </div>

                    <div>
                      <input
                        id="signup-confirm-password"
                        type="password"
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        placeholder="Confirm password"
                        required
                        minLength={12}
                        autoComplete="new-password"
                        aria-label="Confirm password"
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <input
                        id="signup-display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name (optional)"
                        aria-label="Display name"
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {!isEmail && !signupEmail.trim() && (
                      <label className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200/90">
                        <input
                          type="checkbox"
                          checked={acknowledgeNoRecovery}
                          onChange={(e) => setAcknowledgeNoRecovery(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-background accent-primary"
                        />
                        <span>
                          I understand. Finlynq encrypts everything with my password, and there{`'`}s
                          no recovery key. Forgetting it means losing all my data. Without an
                          email I also can{`'`}t reset the password at all.
                        </span>
                      </label>
                    )}

                    {error && (
                      <p className="text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={loading || signupPassword !== signupConfirmPassword || !signupPassword || (!isEmail && !signupEmail.trim() && !acknowledgeNoRecovery)}
                      className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {loading ? "Creating account..." : "Create account"}
                    </button>
                  </>
                )}
              </form>
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
