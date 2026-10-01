"use client";

/**
 * Settings > Account: passkeys. Self-contained (no props), fetches its own list.
 *
 * Add:    register/options -> registerPasskey -> register/verify
 *         -> (needsPrfAssertion) enablePasskeyPrf(id)
 * Rename: PATCH /api/settings/passkeys/[id]
 * Remove: DELETE /api/settings/passkeys/[id] with the account password
 *         (step-up); a session that never passed 2FA also needs a TOTP code or
 *         a passkey assertion (the server answers 401 second-factor-required).
 * Enable password-free unlock: enablePasskeyPrf for credentials without PRF.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fingerprint, Check, AlertTriangle } from "lucide-react";
import { formatDateTimeLocal } from "@/lib/currency";
import { enablePasskeyPrf, registerPasskey } from "@/lib/client/passkey-prf";
import { getPasskeyStepUp } from "@/lib/client/passkey-stepup";

const STRINGS = {
  title: "Passkeys",
  description: "Sign in and verify with your fingerprint, face or a security key",
  unsupported: "This browser does not support passkeys.",
  none: "No passkeys yet.",
  addButton: "Add a passkey",
  passwordLabel: "Current password",
  passwordNeeded: "Enter your password to continue.",
  createButton: "Create passkey",
  working: "Working…",
  cancel: "Cancel",
  createdLabel: "Added",
  lastUsedLabel: "Last used",
  neverUsed: "Never used",
  badgePrf: "Unlock without password",
  badge2fa: "2FA only",
  enablePrf: "Enable password-free unlock",
  enablePrfSubmit: "Enable",
  rename: "Rename",
  save: "Save",
  remove: "Remove",
  removeConfirmTitle: "Remove this passkey?",
  removeConfirmBody: "Enter your password to remove it. You will no longer be able to use it to sign in.",
  removeSubmit: "Remove passkey",
  totpLabel: "Authenticator code (6 digits)",
  verifyRemove: "Verify and remove",
  usePasskeyInstead: "Use a passkey instead",
  secondFactorNote: "This session has not passed two-factor verification. Verify to remove the passkey.",
  added2fa: "Passkey added. It will be used for two-factor verification; it cannot unlock your data without your password on this device or browser.",
  addedPrf: "Passkey added. It can also unlock your data without your password.",
  addedNeedPassword: "Passkey added. Enter your password to enable password-free unlock.",
  prfEnabled: "Password-free unlock enabled.",
  prfUnavailable: "This passkey cannot unlock your data without a password (the authenticator does not support it).",
  removed: "Passkey removed.",
  renamed: "Passkey renamed.",
  cancelledMsg: "Passkey request was cancelled.",
  genericError: "Something went wrong. Please try again.",
  loadError: "Could not load your passkeys.",
  passwordIncorrect: "Your password is incorrect.",
} as const;

interface Passkey {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
  prfSupported: boolean;
}

type Json = Record<string, unknown>;

async function api(url: string, method: string, body?: Json): Promise<{ ok: boolean; status: number; json: Json }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: ((await res.json().catch(() => ({}))) ?? {}) as Json };
}

const isCancel = (e: unknown) => {
  const n = (e as { name?: string })?.name;
  return n === "NotAllowedError" || n === "AbortError";
};
const errText = (j: Json, fallback: string) => (typeof j.error === "string" && j.error ? j.error : fallback);

export function PasskeysCard() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [supported, setSupported] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // add
  const [adding, setAdding] = useState(false);
  const [addPassword, setAddPassword] = useState("");
  const [addNeedsPassword, setAddNeedsPassword] = useState(false);

  // rename
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  // remove
  const [removing, setRemoving] = useState<{
    id: string;
    password: string;
    totp: string;
    needs2fa: boolean;
    totpOffered: boolean;
  } | null>(null);

  // enable password-free unlock
  const [enabling, setEnabling] = useState<{ id: string; password: string; needsPassword: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/passkeys", { credentials: "same-origin" });
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      const data = await res.json();
      setPasskeys((data.passkeys ?? []) as Passkey[]);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined");
    void load();
  }, [load]);

  function resetAdd() {
    setAdding(false);
    setAddPassword("");
    setAddNeedsPassword(false);
  }

  async function submitAdd() {
    setBusy(true);
    setError("");
    setMessage("");
    const pw = addPassword || undefined;
    try {
      const o = await api("/api/settings/passkeys/register/options", "POST", pw ? { currentPassword: pw } : {});
      if (o.status === 401) {
        setAdding(true);
        setAddNeedsPassword(true);
        setError(addPassword ? STRINGS.passwordIncorrect : STRINGS.passwordNeeded);
        return;
      }
      if (!o.ok) {
        setError(errText(o.json, STRINGS.genericError));
        return;
      }
      let reg: Awaited<ReturnType<typeof registerPasskey>>;
      try {
        reg = await registerPasskey(o.json.options as Parameters<typeof registerPasskey>[0]);
      } catch (e) {
        setError(isCancel(e) ? STRINGS.cancelledMsg : STRINGS.genericError);
        return;
      }
      const v = await api("/api/settings/passkeys/register/verify", "POST", {
        token: o.json.token,
        response: reg.response,
      });
      if (!v.ok) {
        setError(errText(v.json, STRINGS.genericError));
        return;
      }
      const id = v.json.id as string;
      let note: string = STRINGS.added2fa;
      if (v.json.needsPrfAssertion) {
        const r = await enablePasskeyPrf(id, pw);
        if (r.ok) note = STRINGS.addedPrf;
        else if (r.code === "password_required") {
          setEnabling({ id, password: "", needsPassword: true });
          note = STRINGS.addedNeedPassword;
        }
      }
      resetAdd();
      setMessage(note);
      await load();
    } catch {
      setError(STRINGS.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function submitRename() {
    if (!renaming) return;
    const label = renaming.value.trim();
    if (!label) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api(`/api/settings/passkeys/${encodeURIComponent(renaming.id)}`, "PATCH", { label });
      if (!r.ok) {
        setError(errText(r.json, STRINGS.genericError));
        return;
      }
      setRenaming(null);
      setMessage(STRINGS.renamed);
      await load();
    } catch {
      setError(STRINGS.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function submitEnable(id: string, password?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await enablePasskeyPrf(id, password || undefined);
      if (r.ok) {
        setEnabling(null);
        setMessage(STRINGS.prfEnabled);
        await load();
      } else if (r.code === "password_required") {
        setEnabling({ id, password: password ?? "", needsPassword: true });
        setError(password ? STRINGS.passwordIncorrect : STRINGS.passwordNeeded);
      } else if (r.code === "prf_unavailable") {
        setEnabling(null);
        setError(STRINGS.prfUnavailable);
      } else if (r.code === "cancelled") {
        setError(STRINGS.cancelledMsg);
      } else {
        setError(STRINGS.genericError);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitRemove(extra: Json = {}) {
    if (!removing) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api(`/api/settings/passkeys/${encodeURIComponent(removing.id)}`, "DELETE", {
        currentPassword: removing.password,
        ...extra,
      });
      if (r.ok) {
        setPasskeys((list) => (list ? list.filter((p) => p.id !== removing.id) : list));
        setRemoving(null);
        setMessage(typeof r.json.warning === "string" ? `${STRINGS.removed} ${r.json.warning}` : STRINGS.removed);
        return;
      }
      if (r.status === 401 && r.json.code === "second-factor-required") {
        const methods = Array.isArray(r.json.methods) ? (r.json.methods as string[]) : [];
        setRemoving({ ...removing, needs2fa: true, totpOffered: methods.includes("totp") });
        return;
      }
      setError(errText(r.json, STRINGS.genericError));
    } catch {
      setError(STRINGS.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function removeWithPasskey() {
    if (!removing) return;
    setBusy(true);
    setError("");
    try {
      const step = await getPasskeyStepUp("passkey-remove");
      if (!step.ok) {
        setError(step.code === "cancelled" ? STRINGS.cancelledMsg : STRINGS.genericError);
        setBusy(false);
        return;
      }
      setBusy(false);
      await submitRemove({ passkeyStepUp: step.passkeyStepUp });
    } catch {
      setError(STRINGS.genericError);
      setBusy(false);
    }
  }

  const lastLabel = (p: Passkey) => (p.lastUsedAt ? `${STRINGS.lastUsedLabel} ${formatDateTimeLocal(p.lastUsedAt)}` : STRINGS.neverUsed);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{STRINGS.title}</CardTitle>
            <CardDescription>{STRINGS.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="status" aria-live="polite">
          {message && (
            <p className="flex items-start gap-2 text-sm text-emerald-600">
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {message}
            </p>
          )}
        </div>
        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {loadFailed && <p className="text-sm text-destructive">{STRINGS.loadError}</p>}

        {passkeys && passkeys.length === 0 && <p className="text-sm text-muted-foreground">{STRINGS.none}</p>}

        {passkeys && passkeys.length > 0 && (
          <ul className="space-y-2" aria-label="Your passkeys">
            {passkeys.map((p) => {
              const name = p.label || "Passkey";
              return (
                <li key={p.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2" data-testid={`passkey-${p.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      {renaming?.id === p.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`New name for ${name}`}
                            value={renaming.value}
                            maxLength={60}
                            onChange={(e) => setRenaming({ id: p.id, value: e.target.value })}
                          />
                          <Button size="sm" onClick={submitRename} disabled={busy || !renaming.value.trim()}>
                            {STRINGS.save}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                            {STRINGS.cancel}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{name}</p>
                          {p.prfSupported ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {STRINGS.badgePrf}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {STRINGS.badge2fa}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {STRINGS.createdLabel} {formatDateTimeLocal(p.createdAt)} · {lastLabel(p)}
                      </p>
                    </div>
                    {renaming?.id !== p.id && !removing && (
                      <div className="flex flex-wrap gap-1">
                        {!p.prfSupported && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => submitEnable(p.id)}
                            aria-label={`${STRINGS.enablePrf} (${name})`}
                          >
                            {STRINGS.enablePrf}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" aria-label={`${STRINGS.rename} ${name}`} onClick={() => setRenaming({ id: p.id, value: p.label ?? "" })}>
                          {STRINGS.rename}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${STRINGS.remove} ${name}`}
                          onClick={() => setRemoving({ id: p.id, password: "", totp: "", needs2fa: false, totpOffered: false })}
                        >
                          {STRINGS.remove}
                        </Button>
                      </div>
                    )}
                  </div>

                  {enabling?.id === p.id && enabling.needsPassword && (
                    <div className="mt-3 space-y-2" role="group" aria-label="Enable password-free unlock">
                      <label htmlFor={`prf-pw-${p.id}`} className="text-sm font-medium">
                        {STRINGS.passwordLabel}
                      </label>
                      <Input
                        id={`prf-pw-${p.id}`}
                        type="password"
                        autoComplete="current-password"
                        value={enabling.password}
                        onChange={(e) => setEnabling({ ...enabling, password: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busy || !enabling.password} onClick={() => submitEnable(p.id, enabling.password)}>
                          {STRINGS.enablePrfSubmit}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEnabling(null)}>
                          {STRINGS.cancel}
                        </Button>
                      </div>
                    </div>
                  )}

                  {removing?.id === p.id && (
                    <div className="mt-3 space-y-2" role="group" aria-label="Remove passkey">
                      <p className="text-sm font-medium text-foreground">{STRINGS.removeConfirmTitle}</p>
                      <p className="text-xs text-muted-foreground">{STRINGS.removeConfirmBody}</p>
                      <label htmlFor={`rm-pw-${p.id}`} className="text-sm font-medium">
                        {STRINGS.passwordLabel}
                      </label>
                      <Input
                        id={`rm-pw-${p.id}`}
                        type="password"
                        autoComplete="current-password"
                        value={removing.password}
                        onChange={(e) => setRemoving({ ...removing, password: e.target.value })}
                      />
                      {removing.needs2fa && (
                        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                          <p className="text-xs text-amber-700 dark:text-amber-300">{STRINGS.secondFactorNote}</p>
                          {removing.totpOffered && (
                            <>
                              <label htmlFor={`rm-totp-${p.id}`} className="text-sm font-medium">
                                {STRINGS.totpLabel}
                              </label>
                              <Input
                                id={`rm-totp-${p.id}`}
                                inputMode="numeric"
                                maxLength={6}
                                autoComplete="one-time-code"
                                value={removing.totp}
                                onChange={(e) => setRemoving({ ...removing, totp: e.target.value.replace(/\D/g, "") })}
                              />
                              <Button
                                size="sm"
                                disabled={busy || !removing.password || removing.totp.length !== 6}
                                onClick={() => submitRemove({ totpCode: removing.totp })}
                              >
                                {STRINGS.verifyRemove}
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" disabled={busy || !removing.password} onClick={removeWithPasskey}>
                            {STRINGS.usePasskeyInstead}
                          </Button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {!removing.needs2fa && (
                          <Button size="sm" variant="destructive" disabled={busy || !removing.password} onClick={() => submitRemove()}>
                            {STRINGS.removeSubmit}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
                          {STRINGS.cancel}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!supported && <p className="text-xs text-muted-foreground">{STRINGS.unsupported}</p>}

        {adding && addNeedsPassword ? (
          <div className="space-y-3 rounded-lg border border-border p-3" role="group" aria-label="Add a passkey">
            <div className="space-y-1.5">
              <label htmlFor="passkey-add-password" className="text-sm font-medium">
                {STRINGS.passwordLabel}
              </label>
              <Input
                id="passkey-add-password"
                type="password"
                autoComplete="current-password"
                value={addPassword}
                onChange={(e) => setAddPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submitAdd} disabled={busy || !addPassword}>
                {busy ? STRINGS.working : STRINGS.createButton}
              </Button>
              <Button size="sm" variant="ghost" onClick={resetAdd} disabled={busy}>
                {STRINGS.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" disabled={!supported || busy} onClick={() => void submitAdd()}>
            {busy ? STRINGS.working : STRINGS.addButton}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
