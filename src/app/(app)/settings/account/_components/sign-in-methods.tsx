"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, AlertTriangle, Check } from "lucide-react";

const STRINGS = {
  title: "Sign-in methods",
  description: "Manage how you sign in to your account",
  googleSection: "Google",
  linkedAt: "Linked",
  linkedDate: "on {{date}}",
  lastUsed: "Last used {{date}}",
  unlinkButton: "Unlink",
  linkButton: "Link Google account",
  unlinkSuccess: "Google account unlinked",
  linkSuccess: "Google account linked",
  linkSessionError: "Your session changed during linking. Sign in again and retry.",
  linkAlreadyLinkedError: "That Google account is already linked to another Finlynq account.",
  passwordLabel: "Password to confirm",
  passwordPlaceholder: "Enter your password",
  unlinkConfirmTitle: "Unlink Google",
  unlinkConfirmMessage: "Enter your password to unlink your Google account",
  unlinkConfirm: "Unlink",
  cancel: "Cancel",
  unlinking: "Unlinking…",
  invalidPasswordError: "Invalid password",
  rateLimitError: "Too many attempts. Please try again later.",
  genericError: "An error occurred",
} as const;

interface SignInMethod {
  google: {
    linked: boolean;
    email?: string;
    linkedAt?: string;
    lastLoginAt?: string | null;
  };
  hasPassword: boolean;
  devices: Array<{
    id: string;
    label: string;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string;
    current: boolean;
  }>;
}

export function SignInMethods() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<SignInMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Unlink dialog state
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);
  const [unlinkPassword, setUnlinkPassword] = useState("");
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState("");

  // Messages
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Load sign-in methods and config
  useEffect(() => {
    async function loadData() {
      try {
        const [methodsRes, configRes] = await Promise.all([
          fetch("/api/settings/sign-in-methods"),
          fetch("/api/auth/config"),
        ]);

        if (methodsRes.ok) {
          const methodsData = await methodsRes.json();
          setData(methodsData);
        }

        if (configRes.ok) {
          const configData = await configRes.json();
          setGoogleEnabled(configData.googleEnabled ?? false);
        }
      } catch (err) {
        console.error("Failed to load sign-in methods:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Handle URL search params for messages
  useEffect(() => {
    const googleParam = searchParams.get("google");
    const errorParam = searchParams.get("error");

    if (!googleParam && !errorParam) return;

    const timeoutId = setTimeout(() => {
      if (googleParam === "linked") {
        setSuccess(STRINGS.linkSuccess);
        router.replace("/settings/account");
      } else if (errorParam === "google_link_session") {
        setError(STRINGS.linkSessionError);
        router.replace("/settings/account");
      } else if (errorParam === "google_already_linked") {
        setError(STRINGS.linkAlreadyLinkedError);
        router.replace("/settings/account");
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [searchParams, router]);

  async function handleUnlink() {
    setUnlinkError("");

    if (!unlinkPassword) {
      setUnlinkError("Password is required");
      return;
    }

    setUnlinking(true);
    try {
      const res = await fetch("/api/settings/sign-in-methods/google", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: unlinkPassword }),
      });

      if (!res.ok) {
        const responseData = await res.json();
        if (res.status === 401) {
          setUnlinkError(STRINGS.invalidPasswordError);
        } else if (res.status === 429) {
          setUnlinkError(STRINGS.rateLimitError);
        } else {
          setUnlinkError(responseData.error || STRINGS.genericError);
        }
        return;
      }

      setSuccess(STRINGS.unlinkSuccess);
      setShowUnlinkDialog(false);
      setUnlinkPassword("");
      setData((d) =>
        d
          ? {
              ...d,
              google: { linked: false },
            }
          : null
      );
    } catch (_err) {
      setUnlinkError(STRINGS.genericError);
    } finally {
      setUnlinking(false);
    }
  }


  if (loading) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{STRINGS.title}</CardTitle>
            <CardDescription>{STRINGS.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Success/Error messages */}
        {success && (
          <p className="text-sm text-emerald-600 flex items-center gap-2" role="status">
            <Check className="h-4 w-4" />
            {success}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive flex items-center gap-2" role="alert">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        )}

        {/* Google sign-in row */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{STRINGS.googleSection}</p>
          {data?.google.linked ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-sm">
                <p className="font-medium text-foreground">{data.google.email}</p>
                <p className="text-xs text-muted-foreground">
                  {STRINGS.linkedAt}
                  {data.google.linkedAt && ` ${new Date(data.google.linkedAt).toLocaleDateString()}`}
                </p>
                {data.google.lastLoginAt && (
                  <p className="text-xs text-muted-foreground">
                    {STRINGS.lastUsed.replace("{{date}}", new Date(data.google.lastLoginAt).toLocaleDateString())}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUnlinkDialog(true)}
              >
                {STRINGS.unlinkButton}
              </Button>
            </div>
          ) : googleEnabled ? (
            <a
              href="/api/auth/google/start?intent=link&next=/settings/account"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {STRINGS.linkButton}
            </a>
          ) : null}
        </div>

        {/* Unlink dialog */}
        {showUnlinkDialog && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium">{STRINGS.unlinkConfirmTitle}</p>
            <p className="text-xs text-muted-foreground">{STRINGS.unlinkConfirmMessage}</p>

            <div>
              <label htmlFor="unlink-password" className="text-xs font-medium text-muted-foreground">
                {STRINGS.passwordLabel}
              </label>
              <Input
                id="unlink-password"
                type="password"
                autoComplete="current-password"
                placeholder={STRINGS.passwordPlaceholder}
                value={unlinkPassword}
                onChange={(e) => setUnlinkPassword(e.target.value)}
                disabled={unlinking}
              />
            </div>

            {unlinkError && (
              <p className="text-xs text-destructive flex items-center gap-2" role="alert">
                <AlertTriangle className="h-3 w-3" />
                {unlinkError}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleUnlink}
                disabled={unlinking || !unlinkPassword}
              >
                {unlinking ? STRINGS.unlinking : STRINGS.unlinkConfirm}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowUnlinkDialog(false);
                  setUnlinkPassword("");
                  setUnlinkError("");
                }}
                disabled={unlinking}
              >
                {STRINGS.cancel}
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
