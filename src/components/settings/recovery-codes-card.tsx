"use client";

/**
 * Settings > Account: recovery codes. Self-contained (no props), fetches its own status.
 *
 * Status:   GET  /api/settings/recovery-codes -> { unused, total, createdAt }
 * Generate: POST /api/settings/recovery-codes with the account password (step-up)
 *           -> { codes[10] }, shown ONCE. The plaintext lives only in this
 *           component's state until the user confirms "I saved them"; it is
 *           never stored in the browser and never fetched again.
 */

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { Field } from "@/components/ui/field";
import { formatDateTimeLocal } from "@/lib/currency";

const STRINGS = {
  title: "Recovery codes",
  description: "One-time codes to get back in if you lose your password, authenticator or passkey. Shown once; store them in a password manager or print them.",
  statusNone: "No codes yet.",
  generated: "Generated",
  generate: "Generate codes",
  regenerate: "Regenerate codes",
  confirmGenerate: "Generate codes",
  confirmRegenerate: "Replace my codes",
  regenerateWarning: "Existing codes stop working once new ones are generated.",
  passwordLabel: "Password",
  cancel: "Cancel",
  working: "Working…",
  codesTitle: "Your recovery codes",
  codesWarning: "Save these now. Shown once; each works once.",
  copyAll: "Copy all",
  copied: "Copied",
  copyFailed: "Could not copy. Select the codes and copy them manually.",
  download: "Download .txt",
  savedLabel: "I saved them",
  done: "Done",
  doneStatus: "Recovery codes saved.",
  lowWarning: (n: number) => `Only ${n} recovery code${n === 1 ? "" : "s"} left. Generate a new set soon.`,
  noneLeftWarning: "You have no unused recovery codes left. Generate a new set.",
  passwordIncorrect: "Your password is incorrect.",
  locked: "Your session needs to be unlocked. Please sign in again.",
  rateLimited: "Too many attempts. Please try again later.",
  genericError: "Could not generate recovery codes. Please try again.",
  loadError: "Could not load recovery code status.",
} as const;

interface Status {
  unused: number;
  total: number;
  createdAt: string | null;
}

export function RecoveryCodesCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  const aliveRef = useRef(true);

  async function loadStatus() {
    try {
      const res = await fetch("/api/settings/recovery-codes", { credentials: "same-origin" });
      if (!res.ok) {
        if (aliveRef.current) setLoadFailed(true);
        return;
      }
      const data = (await res.json()) as Status;
      if (aliveRef.current) {
        setStatus({ unused: data.unused ?? 0, total: data.total ?? 0, createdAt: data.createdAt ?? null });
        setLoadFailed(false);
      }
    } catch {
      if (aliveRef.current) setLoadFailed(true);
    }
  }

  useEffect(() => {
    aliveRef.current = true;
    void loadStatus();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/settings/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 401
            ? STRINGS.passwordIncorrect
            : res.status === 423
              ? STRINGS.locked
              : res.status === 429
                ? STRINGS.rateLimited
                : STRINGS.genericError
        );
        return;
      }
      setCodes(Array.isArray(data.codes) ? (data.codes as string[]) : []);
      setSaved(false);
      setCopyMsg("");
      setConfirming(false);
      setPassword("");
    } catch {
      setError(STRINGS.genericError);
    } finally {
      setBusy(false);
    }
  }

  function handleDone() {
    // Drop the plaintext for good, then refresh the (count-only) status.
    setCodes(null);
    setSaved(false);
    setCopyMsg("");
    setNotice(STRINGS.doneStatus);
    void loadStatus();
  }

  async function handleCopy() {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopyMsg(STRINGS.copied);
    } catch {
      setCopyMsg(STRINGS.copyFailed);
    }
  }

  function handleDownload() {
    if (!codes) return;
    const text =
      "Finlynq recovery codes\n" +
      `Generated: ${new Date().toISOString()}\n` +
      "Each code works once. Keep this file somewhere safe.\n\n" +
      codes.join("\n") +
      "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "finlynq-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const hasCodes = !!status && status.total > 0;
  const low = hasCodes && status!.unused <= 2;

  return (
    <Card
      title={STRINGS.title}
      icon={ShieldCheck}
      tone="amber"
      info={STRINGS.description}
      infoLabel="About recovery codes"
      className="space-y-4"
    >
      {loadFailed && <p className="text-sm text-destructive">{STRINGS.loadError}</p>}

      {notice && !codes && (
        <p className="flex items-center gap-2 text-sm text-pos" role="status">
          <Check className="h-4 w-4" aria-hidden="true" />
          {notice}
        </p>
      )}

      {codes ? (
        <div className="space-y-3" role="group" aria-label={STRINGS.codesTitle}>
          <p className="flex items-start gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {STRINGS.codesWarning}
          </p>
          <ul className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm regular:grid-cols-2" data-testid="recovery-codes-list">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {STRINGS.copyAll}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              {STRINGS.download}
            </Button>
            {copyMsg && (
              <span className="text-xs text-muted-foreground" role="status">
                {copyMsg}
              </span>
            )}
          </div>
          <Field label={STRINGS.savedLabel} control="switch" checked={saved} onCheckedChange={(v) => setSaved(v)} />
          <Button size="sm" disabled={!saved} onClick={handleDone}>
            {STRINGS.done}
          </Button>
        </div>
      ) : (
        <>
          {status && (
            <div className="space-y-1 text-sm">
              {hasCodes ? (
                <p className="text-foreground" data-testid="recovery-codes-status">
                  {status.unused} of {status.total} codes unused
                  {status.createdAt ? (
                    <span className="text-muted-foreground"> · {STRINGS.generated} {formatDateTimeLocal(status.createdAt)}</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-muted-foreground" data-keep="status">{STRINGS.statusNone}</p>
              )}
              {low && (
                <p className="flex items-start gap-2 text-warning" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {status.unused === 0 ? STRINGS.noneLeftWarning : STRINGS.lowWarning(status.unused)}
                </p>
              )}
            </div>
          )}

          {confirming ? (
            <form onSubmit={handleGenerate} className="space-y-3 rounded-lg border border-border p-3" aria-label="Generate recovery codes">
              {hasCodes && <p className="text-xs text-warning" data-keep="warning">{STRINGS.regenerateWarning}</p>}
              <Field
                label={STRINGS.passwordLabel}
                id="recovery-codes-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={busy || !password}>
                  {busy ? STRINGS.working : hasCodes ? STRINGS.confirmRegenerate : STRINGS.confirmGenerate}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setConfirming(false); setPassword(""); setError(""); }}>
                  {STRINGS.cancel}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" size="sm" disabled={!status} onClick={() => { setConfirming(true); setNotice(""); }}>
              {hasCodes ? STRINGS.regenerate : STRINGS.generate}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
