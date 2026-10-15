"use client";

/**
 * Account content — API Key + Privacy & Backup. Shared by /account (app shell)
 * and /settings/account. Lifted verbatim from the old /settings/account page.
 */

import { Suspense, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Download, Eye, EyeOff, FileText, Key, KeyRound, Lock, Mail, RefreshCw, Shield, ShieldCheck, Upload } from "lucide-react";
import { TW } from "@/lib/design/tokens";
import { TwoFactor } from "@/app/(app)/settings/account/_components/two-factor";
import { SignInMethods } from "@/app/(app)/settings/account/_components/sign-in-methods";
import { TrustedDevices } from "@/app/(app)/settings/account/_components/trusted-devices";
import { PasskeysCard } from "@/components/settings/passkeys-card";
import { RevealForm } from "@/components/settings/reveal-form";
import { RecoveryCodesCard } from "@/components/settings/recovery-codes-card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/mobile";

export function AccountContent({
  hideHeader = false,
  hideEmail = false,
}: {
  /** Omit the page header — used inside the /account tabbed layout. */
  hideHeader?: boolean;
  /** Omit the Change Email card — /account/info owns it. */
  hideEmail?: boolean;
} = {}) {
  // API Key — the raw key is only held in memory on first creation or
  // after a regenerate. On subsequent page loads, `apiKey` stays null
  // because only a hash is stored server-side; the UI shows a "regenerate
  // to view" state in that case.
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [apiKeyRegenerating, setApiKeyRegenerating] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState("");

  // Backup / restore
  const [backupStatus, setBackupStatus] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<Record<string, number> | null>(null);
  const [restoreBackup, setRestoreBackup] = useState<unknown>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreStep, setRestoreStep] = useState(0); // 0=idle, 1=preview, 2=type RESTORE
  const [restoreStatus, setRestoreStatus] = useState("");

  // Current profile — drives the credential cards. `username` is non-null only
  // in managed mode; self-hosted (passphrase) accounts have no user row, so we
  // hide the change-password / change-email forms there.
  const [me, setMe] = useState<{ username: string | null; email: string | null } | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  // Change password
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwStatus, setPwStatus] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  // Load current profile (email + managed-mode gate)
  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setMe({ username: data.username ?? null, email: data.email ?? null }); })
      .catch(() => {})
      .finally(() => setMeLoaded(true));
  }, []);

  function closePw(keepStatus = false) {
    setPwOpen(false);
    setCurPw("");
    setNewPw("");
    setConfirmPw("");
    setPwError("");
    if (!keepStatus) setPwStatus("");
  }

  function closeEmail(keepStatus = false) {
    setEmailOpen(false);
    setNewEmail("");
    setEmailPw("");
    setEmailError("");
    if (!keepStatus) setEmailStatus("");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwStatus("");
    if (newPw.length < 12) {
      setPwError("New password must be at least 12 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("New passwords do not match.");
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch("/api/settings/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data.error || "Failed to change password.");
        return;
      }
      setPwStatus("Password updated.");
      closePw(true);
    } catch {
      setPwError("Failed to change password.");
    } finally {
      setPwSaving(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailStatus("");
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, currentPassword: emailPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailError(data.error || "Failed to change email.");
        return;
      }
      const saved = data.email ?? newEmail;
      setMe((m) => (m ? { ...m, email: saved } : m));
      setEmailStatus(`Verification email sent to ${saved}. Check your inbox to confirm.`);
      closeEmail(true);
    } catch {
      setEmailError("Failed to change email.");
    } finally {
      setEmailSaving(false);
    }
  }

  // Load API key
  useEffect(() => {
    fetch("/api/settings/api-key")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.apiKey) setApiKey(data.apiKey); })
      .catch(() => {})
      .finally(() => setApiKeyLoaded(true));
  }, []);

  async function handleRegenerateApiKey() {
    setApiKeyRegenerating(true);
    setApiKeyStatus("");
    try {
      const res = await fetch("/api/settings/api-key", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setApiKey(data.apiKey);
        setApiKeyVisible(true);
        setApiKeyStatus("New key generated");
      } else {
        setApiKeyStatus(data.error || "Failed to regenerate");
      }
    } catch {
      setApiKeyStatus("Failed to regenerate key");
    }
    setApiKeyRegenerating(false);
  }

  function handleCopyApiKey() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2000);
  }

  async function handleDownloadBackup() {
    setBackupStatus("Preparing backup…");
    try {
      const res = await fetch("/api/data/export");
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `finlynq-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupStatus("Backup downloaded successfully");
    } catch {
      setBackupStatus("Backup failed — please try again");
    }
  }

  async function handleRestoreFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setRestoreFile(file);
    setRestorePreview(null);
    setRestoreBackup(null);
    setRestoreStep(0);
    setRestoreStatus("");
    setRestoreConfirm("");
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setRestoreBackup(parsed);
      // Get preview from server
      const res = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup: parsed, confirm: false }),
      });
      if (!res.ok) {
        const err = await res.json();
        setRestoreStatus(err.error ?? "Invalid backup file");
        return;
      }
      const data = await res.json();
      setRestorePreview(data.preview);
      setRestoreStep(1);
    } catch {
      setRestoreStatus("Could not parse backup file — is it a valid Finlynq backup?");
    }
  }

  async function handleRestoreConfirm() {
    if (restoreConfirm !== "RESTORE") {
      setRestoreStatus("Type RESTORE to confirm");
      return;
    }
    setRestoreStatus("Restoring…");
    try {
      const res = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup: restoreBackup, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRestoreStatus(data.error ?? "Restore failed");
        return;
      }
      setRestoreStatus("Restore complete! Reloading…");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setRestoreStatus("Restore failed — please try again");
    }
  }

  return (
    <div className="w-full space-y-6">
      {!hideHeader && <PageHeader
          title="Account"
        />}

      <div className={TW.grid3}>
      {/* Security Section */}
      <TwoFactor />
      <Suspense fallback={null}>
        <SignInMethods />
      </Suspense>
      <TrustedDevices />
      <PasskeysCard />
      <RecoveryCodesCard />

      {/* Change Password — managed mode only. */}
      {meLoaded && me?.username && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <CardTitle icon={Lock} tone="indigo">
                  Password
                  <InfoTip label="About password" text="Your data is re-encrypted under the new password. Nothing is lost." />
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {pwStatus && !pwOpen && (
              <p className="text-sm text-pos flex items-center gap-1" role="status">
                <Check className="h-3.5 w-3.5" /> {pwStatus}
              </p>
            )}
            <RevealForm open={pwOpen} onOpen={() => { setPwStatus(""); setPwOpen(true); }} buttonLabel="Change password">
            <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
              <Field
                label="Current"
                type="password"
                autoComplete="current-password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
              />
              <div>
                <Field
                  label="New"
                  info="At least 12 characters."
                  infoLabel="Password rule"
                  type="password"
                  autoComplete="new-password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
              </div>
              <Field
                label="Confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
              {pwError && <p className="text-sm text-destructive">{pwError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={pwSaving || !curPw || !newPw || !confirmPw}>
                  {pwSaving ? "Saving…" : "Update password"}
                </Button>
                <Button type="button" variant="ghost" disabled={pwSaving} onClick={() => closePw()}>
                  Cancel
                </Button>
              </div>
            </form>
            </RevealForm>
          </CardContent>
        </Card>
      )}

      {/* Change Email — managed mode only. */}
      {!hideEmail && meLoaded && me?.username && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <CardTitle icon={Mail} tone="cyan">
                  Email
                  <InfoTip label="About email" text="Recovery email used to reset a forgotten password." />
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground" data-keep="status">
              Current: <span className="font-medium text-foreground">{me?.email || "none set"}</span>
            </p>
            {emailStatus && !emailOpen && (
              <p className="text-sm text-pos flex items-center gap-1" role="status">
                <Check className="h-3.5 w-3.5" /> {emailStatus}
              </p>
            )}
            <RevealForm open={emailOpen} onOpen={() => { setEmailStatus(""); setEmailOpen(true); }} buttonLabel="Change email">
            <form onSubmit={handleChangeEmail} className="space-y-3 max-w-sm">
              <Field
                label="New email"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <Field
                label="Current"
                type="password"
                autoComplete="current-password"
                value={emailPw}
                onChange={(e) => setEmailPw(e.target.value)}
              />
              {emailError && <p className="text-sm text-destructive">{emailError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={emailSaving || !newEmail || !emailPw}>
                  {emailSaving ? "Saving…" : "Update email"}
                </Button>
                <Button type="button" variant="ghost" disabled={emailSaving} onClick={() => closeEmail()}>
                  Cancel
                </Button>
              </div>
            </form>
            </RevealForm>
          </CardContent>
        </Card>
      )}

      {/* API Key */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/10 text-chart-5">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <CardTitle icon={KeyRound} tone="violet">
                API key
                <InfoTip label="About api key" text="Connect AI assistants via MCP or call the REST API. The key is unscoped and never expires: full read/write until you regenerate it, which invalidates the old key." />
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Field
              readOnly
              value={
                !apiKeyLoaded
                  ? "Loading…"
                  : apiKey
                    ? (apiKeyVisible ? apiKey : `${apiKey.slice(0, 6)}${"•".repeat(20)}${apiKey.slice(-4)}`)
                    : "•".repeat(40)
              }
              className="flex-1"
              controlClassName="font-mono"
            />
            <Button aria-label={apiKeyVisible ? "Hide key" : "Show key"}
              variant="outline"
              iconOnly
              onClick={() => setApiKeyVisible(!apiKeyVisible)}
              title={apiKeyVisible ? "Hide key" : "Show key"}
              disabled={!apiKey}
            >
              {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button aria-label="Copy key"
              variant="outline"
              iconOnly
              onClick={handleCopyApiKey}
              title="Copy key"
              disabled={!apiKey}
            >
              {apiKeyCopied ? <Check className="h-4 w-4 text-pos" /> : <FileText className="h-4 w-4" />}
            </Button>
          </div>
          {apiKey && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <strong>Save this key now.</strong> It can&rsquo;t be shown again.
            </div>
          )}
          {apiKeyLoaded && !apiKey && (
            <p className="text-xs text-muted-foreground" data-keep="status">
              Key on file. Regenerate if unsaved.
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerateApiKey}
              disabled={apiKeyRegenerating}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${apiKeyRegenerating ? "animate-spin" : ""}`} />
              {apiKeyRegenerating ? "Regenerating…" : "Regenerate"}
            </Button>
            {apiKeyStatus && (
              <p className="text-xs text-muted-foreground" data-keep="status">{apiKeyStatus}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Privacy & Backup */}
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle icon={ShieldCheck} tone="emerald">
                Backup
                <InfoTip label="About backup" text="Full backup and restore, your way back in if you lose your password. Data is encrypted with AES-256; only you hold the key." />
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Download backup */}
          <div>
            <div className="mb-3 flex items-center gap-1">
              <p className="text-sm font-medium text-foreground">Download backup</p>
              <InfoTip label="About backup download" text="All your data (accounts, transactions, budgets, portfolio, goals, more) as one JSON file. Keep it safe: it is how you recover after a reset." />
            </div>
            <Button variant="outline" onClick={handleDownloadBackup} className="gap-2">
              <Download className="h-4 w-4" />
              Download
            </Button>
            {backupStatus && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1" data-keep="status">
                <Check className="h-3 w-3 text-pos" /> {backupStatus}
              </p>
            )}
          </div>

          <div className="border-t border-border/50" />

          {/* Restore from backup */}
          <div>
            <div className="mb-3 flex items-center gap-1">
              <p className="text-sm font-medium text-foreground">Restore backup</p>
              <InfoTip label="About restore" text="Upload a Finlynq backup JSON. You see a preview before anything changes." />
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
              <Upload className="h-4 w-4" />
              Choose file
              <input
                type="file"
                accept=".json"
                className="sr-only"
                onChange={handleRestoreFileChange}
              />
            </label>
            {restoreFile && <span className="ml-3 text-xs text-muted-foreground">{restoreFile.name}</span>}

            {/* Preview */}
            {restoreStep >= 1 && restorePreview && (
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Contents</p>
                <div className="grid grid-cols-2 regular:grid-cols-3 gap-2">
                  {Object.entries(restorePreview)
                    .filter(([, v]) => v > 0)
                    .map(([key, count]) => (
                      <div key={key} className="flex items-center justify-between rounded-lg bg-background border border-border/60 px-3 py-2">
                        <span className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                        <span className="text-xs font-semibold text-foreground">{count}</span>
                      </div>
                    ))}
                </div>

                <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 flex items-start gap-2 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span><strong>Replaces all your current data. Cannot be undone.</strong> Download a backup first.</span>
                </div>

                <div className="flex items-center gap-2">
                  <Field
                    value={restoreConfirm}
                    onChange={(e) => setRestoreConfirm(e.target.value)}
                    placeholder="Type RESTORE to confirm"
                    className="max-w-52"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={restoreConfirm !== "RESTORE"}
                    onClick={handleRestoreConfirm}
                  >
                    Restore
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setRestoreStep(0); setRestoreFile(null); setRestoreConfirm(""); setRestoreStatus(""); setRestorePreview(null); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {restoreStatus && (
              <p data-keep="status" className={`text-xs mt-2 flex items-center gap-1 ${restoreStatus.startsWith("Restore complete") ? "text-pos" : "text-muted-foreground"}`}>
                {restoreStatus.startsWith("Restore complete") ? <Check className="h-3 w-3 text-pos" /> : <AlertTriangle className="h-3 w-3 text-warning" />}
                {restoreStatus}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
