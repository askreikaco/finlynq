"use client";

/**
 * Account page content — shared between /account and /settings/account.
 * This renders the account management UI (API keys, password, email, etc.).
 */

import { Suspense, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, RefreshCw, Eye, EyeOff, FileText, Check, Shield, Lock, Mail, Download, Upload, AlertTriangle } from "lucide-react";
import { TwoFactor } from "@/app/(app)/settings/account/_components/two-factor";
import { SignInMethods } from "@/app/(app)/settings/account/_components/sign-in-methods";
import { TrustedDevices } from "@/app/(app)/settings/account/_components/trusted-devices";
import { PasskeysCard } from "@/components/settings/passkeys-card";
import { RevealForm } from "@/components/settings/reveal-form";
import { RecoveryCodesCard } from "@/components/settings/recovery-codes-card";

export function AccountContent() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [apiKeyRegenerating, setApiKeyRegenerating] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState("");

  const [backupStatus, setBackupStatus] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<Record<string, number> | null>(null);
  const [restoreBackup, setRestoreBackup] = useState<unknown>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreStep, setRestoreStep] = useState(0);
  const [restoreStatus, setRestoreStatus] = useState("");

  const [me, setMe] = useState<{ username: string | null; email: string | null } | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwStatus, setPwStatus] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

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
      const data = await res.json();
      if (res.ok) {
        setPwStatus("Password updated successfully.");
        closePw(true);
      } else {
        setPwError(data.error || "Failed to change password.");
      }
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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setEmailError("Invalid email address.");
      return;
    }
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, currentPassword: emailPw }),
      });
      const data = await res.json();
      if (res.ok) {
        const saved = data.email ?? newEmail;
        setMe((m) => (m ? { ...m, email: saved } : m));
        setEmailStatus(`Verification email sent to ${saved}. Check your inbox to confirm.`);
        closeEmail(true);
      } else {
        setEmailError(data.error || "Failed to change email.");
      }
    } catch {
      setEmailError("Failed to change email.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleRegenerateApiKey() {
    setApiKeyRegenerating(true);
    setApiKeyStatus("");
    try {
      const res = await fetch("/api/user/api-key", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setApiKey(data.apiKey ?? null);
        setApiKeyVisible(true);
        setApiKeyCopied(false);
      }
    } finally {
      setApiKeyRegenerating(false);
    }
  }

  async function handleBackup() {
    setBackupStatus("Creating backup...");
    try {
      const res = await fetch("/api/settings/backup");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `finlynq-backup-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setBackupStatus("Backup downloaded.");
        setTimeout(() => setBackupStatus(""), 3000);
      }
    } catch {
      setBackupStatus("Backup failed.");
    }
  }

  async function handleRestoreFile(file: File) {
    setRestoreFile(file);
    setRestoreStep(1);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.backup?.counts) {
        setRestorePreview(data.backup.counts);
        setRestoreBackup(data);
      }
    } catch {
      setRestoreStatus("Invalid backup file.");
    }
  }

  async function handleRestore() {
    if (restoreStep === 1) {
      setRestoreStep(2);
      return;
    }
    if (restoreStep === 2) {
      if (restoreConfirm !== "RESTORE") {
        setRestoreStatus("Type RESTORE to confirm");
        return;
      }
      try {
        const res = await fetch("/api/settings/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(restoreBackup),
        });
        if (res.ok) {
          setRestoreStatus("Restore complete. Reloading...");
          setTimeout(() => { window.location.reload(); }, 1000);
        }
      } catch {
        setRestoreStatus("Restore failed.");
      }
    }
  }

  function copyApiKey() {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Security, keys, and backup</p>
      </div>

      {/* API Key */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">API Key</CardTitle>
              <CardDescription>Use to access Finlynq via MCP or direct API calls</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!apiKeyLoaded ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : apiKey ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border bg-muted/50 px-4 py-2.5 font-mono text-sm">
                  {apiKeyVisible ? apiKey : "••••••••••••••••"}
                </div>
                <Button variant="outline" size="sm" onClick={() => setApiKeyVisible(!apiKeyVisible)}>
                  {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={copyApiKey}>
                  {apiKeyCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No API key created yet.</p>
          )}
          <Button size="sm" onClick={handleRegenerateApiKey} disabled={apiKeyRegenerating}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${apiKeyRegenerating ? "animate-spin" : ""}`} />
            {apiKeyRegenerating ? "Generating…" : "Regenerate"}
          </Button>
          {apiKeyStatus && <p className="text-xs text-muted-foreground">{apiKeyStatus}</p>}
        </CardContent>
      </Card>

      {/* Sign-in Methods */}
      {meLoaded && me?.username && (
        <SignInMethods />
      )}

      {/* Passkeys */}
      <Suspense>
        <PasskeysCard />
      </Suspense>

      {/* Two-Factor */}
      {meLoaded && me?.username && (
        <TwoFactor />
      )}

      {/* Recovery Codes */}
      <Suspense>
        <RecoveryCodesCard />
      </Suspense>

      {/* Trusted Devices */}
      {meLoaded && me?.username && (
        <TrustedDevices />
      )}

      {/* Change Password */}
      {meLoaded && me?.username && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Change Password</CardTitle>
                <CardDescription>Update your login password</CardDescription>
              </div>
            </div>
          </CardHeader>
          {pwOpen ? (
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Current Password</label>
                  <Input
                    type="password"
                    value={curPw}
                    onChange={(e) => setCurPw(e.target.value)}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">New Password</label>
                  <Input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="At least 12 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Confirm Password</label>
                  <Input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Confirm your new password"
                    autoComplete="new-password"
                  />
                </div>
                {pwError && <p className="text-sm text-destructive">{pwError}</p>}
                {pwStatus && <p className="text-sm text-emerald-600">{pwStatus}</p>}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={pwSaving}>
                    {pwSaving ? "Saving…" : "Save Password"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => closePw()}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          ) : (
            <CardContent>
              <Button variant="outline" onClick={() => setPwOpen(true)}>
                Change Password
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Change Email */}
      {meLoaded && me?.username && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Email Address</CardTitle>
                <CardDescription>Update your login email</CardDescription>
              </div>
            </div>
          </CardHeader>
          {emailOpen ? (
            <CardContent>
              <form onSubmit={handleChangeEmail} className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">New Email</label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="your-new-email@example.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Current Password</label>
                  <Input
                    type="password"
                    value={emailPw}
                    onChange={(e) => setEmailPw(e.target.value)}
                    placeholder="Confirm with your password"
                    autoComplete="current-password"
                  />
                </div>
                {emailError && <p className="text-sm text-destructive">{emailError}</p>}
                {emailStatus && <p className="text-sm text-emerald-600">{emailStatus}</p>}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={emailSaving}>
                    {emailSaving ? "Saving…" : "Update Email"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => closeEmail()}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          ) : (
            <CardContent>
              <Button variant="outline" onClick={() => setEmailOpen(true)}>
                Change Email
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Backup & Restore */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-600">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Backup & Restore</CardTitle>
              <CardDescription>Export and import your complete data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={handleBackup}>
            <Download className="h-4 w-4 mr-1.5" /> Download Backup
          </Button>
          {backupStatus && <p className="text-xs text-muted-foreground">{backupStatus}</p>}

          <div className="pt-3 border-t">
            {restoreStep === 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Upload className="h-4 w-4" />
                <span className="text-sm font-medium">Restore from backup</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleRestoreFile(file);
                  }}
                  className="sr-only"
                />
              </label>
            )}
            {restoreStep === 1 && restorePreview && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Preview: {restoreFile?.name}</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {Object.entries(restorePreview).map(([k, v]) => (
                    <li key={k}>{k}: {v}</li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleRestore}>Continue</Button>
                  <Button size="sm" variant="outline" onClick={() => setRestoreStep(0)}>Cancel</Button>
                </div>
              </div>
            )}
            {restoreStep === 2 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Confirm restore — type RESTORE:</p>
                <Input
                  value={restoreConfirm}
                  onChange={(e) => setRestoreConfirm(e.target.value)}
                  placeholder="Type RESTORE"
                />
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleRestore} disabled={restoreConfirm !== "RESTORE"}>
                    Restore
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRestoreStep(0)}>Cancel</Button>
                </div>
                {restoreStatus && <p className="text-xs text-muted-foreground">{restoreStatus}</p>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
