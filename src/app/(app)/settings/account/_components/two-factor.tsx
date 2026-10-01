"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevealForm } from "@/components/settings/reveal-form";
import { Input } from "@/components/ui/input";
import { Shield, Check, AlertTriangle } from "lucide-react";
import QRCode from "qrcode";

const STRINGS = {
  title: "Two-Factor Authentication",
  description: "Protect your account with a time-based one-time password (TOTP)",
  enableButton: "Enable 2FA",
  disableButton: "Disable 2FA",
  generatingQr: "Generating QR code…",
  qrCodeAlt: "TOTP provisioning QR code",
  secretLabel: "Secret key",
  secretHelp: "Save this key in a safe place. You can use it to add your account to another authenticator app.",
  copyButton: "Copy secret",
  copyFailedError: "Could not copy. Select the key and copy it manually.",
  copiedButton: "Copied!",
  codeLabel: "Verification code",
  codePlaceholder: "000000",
  passwordLabel: "Current password",
  enableSubmit: "Confirm",
  disableSubmit: "Confirm",
  enablingStatus: "Enabling…",
  disablingStatus: "Disabling…",
  enabledStatus: "Two-factor authentication enabled",
  disabledStatus: "Two-factor authentication disabled",
  generatingStatus: "Generating setup…",
  invalidCodeError: "Invalid verification code",
  invalidPasswordError: "Invalid password",
  rateLimitError: "Too many attempts. Please try again later.",
  sessionExpiredError: "Session expired. Please sign in again.",
  genericError: "An error occurred",
  enablePrompt: "Enter the 6-digit code from your authenticator app to enable 2FA.",
  disablePrompt: "Enter the 6-digit code from your authenticator app and your password to disable 2FA.",
  statusEnabled: "On — authenticator app",
  codeLengthError: "Code must be 6 digits",
  passwordRequiredError: "Password is required",
  scanLabel: "Scan with authenticator app:",
  cancel: "Cancel",
  statusDisabled: "Off",
} as const;

interface SetupState {
  type: "disabled" | "generating" | "enabling" | "enabled" | "disabling";
}

export function TwoFactor() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SetupState>({ type: "disabled" });

  // Generate/Enable state
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // Load initial MFA state
  useEffect(() => {
    async function loadMfaState() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          // Check if mfaEnabled is in the response; if not, default to false
          const enabled = data.mfaEnabled ?? false;
          setMfaEnabled(enabled);
          setState({ type: enabled ? "enabled" : "disabled" });
        }
      } catch (err) {
        console.error("Failed to load MFA state:", err);
        // Default to disabled if fetch fails
        setState({ type: "disabled" });
      } finally {
        setLoading(false);
      }
    }
    loadMfaState();
  }, []);

  async function handleGenerateQr() {
    setError("");
    setStatus("");
    setState({ type: "generating" });
    setStatus(STRINGS.generatingStatus);

    try {
      const res = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || STRINGS.genericError);
        setState({ type: "disabled" });
        setStatus("");
        return;
      }

      const data = await res.json();

      // Generate the QR locally; only expose the secret once it succeeded.
      const dataUrl = await QRCode.toDataURL(data.uri);
      setSecret(data.secret);
      setQrDataUrl(dataUrl);
      setState({ type: "enabling" });
      setStatus("");
    } catch (_err) {
      setSecret("");
      setQrDataUrl("");
      setError(STRINGS.genericError);
      setState({ type: "disabled" });
      setStatus("");
    }
  }

  function cancelDisable() {
    setState({ type: "enabled" });
    setCode("");
    setPassword("");
    setError("");
  }

  function startDisable() {
    setError("");
    setStatus("");
    setCode("");
    setPassword("");
    setState({ type: "disabling" });
  }

  function handleCopySecret() {
    if (!secret) return;
    navigator.clipboard
      .writeText(secret)
      .then(() => {
        setSecretCopied(true);
        setTimeout(() => setSecretCopied(false), 2000);
      })
      .catch(() => setError(STRINGS.copyFailedError));
  }

  async function handleEnableMfa() {
    setError("");
    setStatus("");

    if (!code || code.length !== 6) {
      setError(STRINGS.codeLengthError);
      return;
    }

    if (!password) {
      setError(STRINGS.passwordRequiredError);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable",
          secret,
          code,
          currentPassword: password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(STRINGS.rateLimitError);
        } else if (res.status === 401) {
          setError(STRINGS.invalidPasswordError);
        } else if (res.status === 400) {
          setError(STRINGS.invalidCodeError);
        } else {
          setError(data.error || STRINGS.genericError);
        }
        return;
      }

      setStatus(STRINGS.enabledStatus);
      setMfaEnabled(true);
      setState({ type: "enabled" });
      setCode("");
      setPassword("");
      setSecret("");
      setQrDataUrl("");
    } catch (_err) {
      setError(STRINGS.genericError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisableMfa() {
    setError("");
    setStatus("");

    if (!code || code.length !== 6) {
      setError(STRINGS.codeLengthError);
      return;
    }

    if (!password) {
      setError(STRINGS.passwordRequiredError);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable",
          code,
          currentPassword: password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(STRINGS.rateLimitError);
        } else if (res.status === 401) {
          setError(STRINGS.invalidPasswordError);
        } else if (res.status === 400) {
          setError(STRINGS.invalidCodeError);
        } else {
          setError(data.error || STRINGS.genericError);
        }
        return;
      }

      setStatus(STRINGS.disabledStatus);
      setMfaEnabled(false);
      setState({ type: "disabled" });
      setCode("");
      setPassword("");
    } catch (_err) {
      setError(STRINGS.genericError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{STRINGS.title}</CardTitle>
            <CardDescription>{STRINGS.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mfaEnabled ? (
          <>
            <p className="text-sm text-emerald-600 flex items-center gap-2">
              <Check className="h-4 w-4" />
              {STRINGS.statusEnabled}
            </p>

            {status && state.type !== "disabling" && (
              <p className="text-sm text-emerald-600 flex items-center gap-1" role="status">
                <Check className="h-3.5 w-3.5" />
                {status}
              </p>
            )}
            {error && state.type !== "disabling" && (
              <p className="text-sm text-destructive flex items-center gap-2" role="alert">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </p>
            )}
            <RevealForm open={state.type === "disabling"} onOpen={startDisable} buttonLabel={STRINGS.disableButton} variant="destructive">
              <form onSubmit={(e) => { e.preventDefault(); handleDisableMfa(); }} className="space-y-3 max-w-sm">
                <p className="text-xs text-muted-foreground">{STRINGS.disablePrompt}</p>

                <div>
                  <label htmlFor="disable-code" className="text-xs font-medium text-muted-foreground">
                    {STRINGS.codeLabel}
                  </label>
                  <Input
                    id="disable-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={STRINGS.codePlaceholder}
                    value={code}
                    onChange={(e) => setCode(e.target.value.slice(0, 6))}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label htmlFor="disable-password" className="text-xs font-medium text-muted-foreground">
                    {STRINGS.passwordLabel}
                  </label>
                  <Input
                    id="disable-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={saving}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-2" role="alert">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                  </p>
                )}
                {status && (
                  <p className="text-sm text-emerald-600 flex items-center gap-1" role="status">
                    <Check className="h-3.5 w-3.5" />
                    {status}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={saving || !code || !password}
                  >
                    {saving ? STRINGS.disablingStatus : STRINGS.disableSubmit}
                  </Button>
                  <Button type="button" variant="ghost" onClick={cancelDisable} disabled={saving}>
                    {STRINGS.cancel}
                  </Button>
                </div>
              </form>
            </RevealForm>
          </>
        ) : state.type === "enabling" ? (
          <>
            <p className="text-xs text-muted-foreground">{STRINGS.enablePrompt}</p>

            {qrDataUrl && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{STRINGS.scanLabel}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt={STRINGS.qrCodeAlt} className="w-48 h-48" />
              </div>
            )}

            <div>
              <label htmlFor="secret" className="text-xs font-medium text-muted-foreground">
                {STRINGS.secretLabel}
              </label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="secret"
                  type="text"
                  readOnly
                  aria-describedby="secret-help"
                  value={secret}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopySecret}
                  disabled={!secret}
                >
                  {secretCopied ? STRINGS.copiedButton : STRINGS.copyButton}
                </Button>
              </div>
              <p id="secret-help" className="text-[11px] text-muted-foreground mt-1">{STRINGS.secretHelp}</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleEnableMfa(); }} className="space-y-3 max-w-sm">
              <div>
                <label htmlFor="enable-code" className="text-xs font-medium text-muted-foreground">
                  {STRINGS.codeLabel}
                </label>
                <Input
                  id="enable-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={STRINGS.codePlaceholder}
                  value={code}
                  onChange={(e) => setCode(e.target.value.slice(0, 6))}
                  disabled={saving}
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="enable-password" className="text-xs font-medium text-muted-foreground">
                  {STRINGS.passwordLabel}
                </label>
                <Input
                  id="enable-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={saving}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive flex items-center gap-2" role="alert">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={saving || !code || !password}
              >
                {saving ? STRINGS.enablingStatus : STRINGS.enableSubmit}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setState({ type: "disabled" });
                  setCode("");
                  setPassword("");
                  setSecret("");
                  setQrDataUrl("");
                  setError("");
                }}
              >
                {STRINGS.cancel}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{STRINGS.statusDisabled}</p>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-2" role="alert">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </p>
            )}
            {status && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                {status}
              </p>
            )}
            <Button
              onClick={handleGenerateQr}
              disabled={state.type === "generating"}
            >
              {state.type === "generating" ? STRINGS.generatingQr : STRINGS.enableButton}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
