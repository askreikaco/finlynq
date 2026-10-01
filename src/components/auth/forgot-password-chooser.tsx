"use client";

/**
 * Forgot-password chooser. Four ways back in, safest first:
 *   1. Passkey            passkeyRecovery(newPassword)            (no data loss)
 *   2. This device        device/check -> device/reset            (no data loss; needs TOTP or a recovery code)
 *   3. Recovery code      code/reset { identifier, code }         (no data loss)
 *   4. Email link         password-reset/request -> reset-password (ERASES ALL DATA)
 * Every success ends with hardReload("/dashboard") (never router.push: a full
 * load drops all in-memory state of whichever account was open before).
 */

import { useEffect, useState } from "react";
import { hardReload } from "@/lib/client/hard-reload";
import { passkeyRecovery } from "@/lib/client/passkey-prf";
import {
  AUTH_INPUT_CLASS,
  NewPasswordFields,
  isNewPasswordValid,
} from "@/components/auth/new-password-fields";

type View = "chooser" | "passkey" | "device" | "code" | "email";

interface DeviceAccount {
  deviceId: string;
  account: string;
  label: string | null;
  available: boolean;
  needs: "totp" | "code" | null;
  reason?: string;
}
interface DeviceCheck {
  available: boolean;
  accounts: DeviceAccount[];
}

const GENERIC_RECOVERY_FAIL = "Recovery failed. Check your details and try again.";
const PRIMARY_BTN =
  "w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";

/** Upper-case, keep letters/digits/dashes: the server normalises separators. */
export function formatRecoveryInput(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9-\s]/g, "");
}
const recoveryCodeComplete = (v: string) => v.replace(/[^A-Z0-9]/g, "").length >= 20;

export function ForgotPasswordChooser() {
  const [view, setView] = useState<View>("chooser");
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [deviceCheck, setDeviceCheck] = useState<DeviceCheck | null>(null);

  useEffect(() => {
    setPasskeySupported(typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined");
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/recovery/device/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        const accounts = Array.isArray(data?.accounts) ? (data.accounts as DeviceAccount[]) : [];
        setDeviceCheck({ available: !!data?.available, accounts });
      } catch {
        if (!cancelled) setDeviceCheck({ available: false, accounts: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (view === "passkey") return <PasskeyRecovery onBack={() => setView("chooser")} />;
  if (view === "device") return <DeviceRecovery check={deviceCheck} onBack={() => setView("chooser")} />;
  if (view === "code") return <CodeRecovery onBack={() => setView("chooser")} />;
  if (view === "email") return <EmailReset onBack={() => setView("chooser")} />;

  const usable = deviceCheck?.accounts.filter((a) => a.available) ?? [];
  const deviceUsable = usable.length > 0;
  const deviceReason =
    deviceCheck === null
      ? "Checking this browser…"
      : deviceUsable
        ? deviceCheck.accounts.length > 1
          ? `${usable.length} accounts on this browser can use this`
          : `Recognised as ${deviceCheck.accounts[0].account}`
        : deviceCheck.accounts.length > 0
          ? "Unavailable: this account has no authenticator app or recovery codes set up."
          : "Unavailable: this browser is not a trusted device.";

  const card = "w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose how to get back in. The first three keep all of your data.
      </p>

      {passkeySupported && (
        <button type="button" className={card} onClick={() => setView("passkey")}>
          <span className="block text-sm font-semibold text-foreground">Use a passkey</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Confirm with your fingerprint, face or security key.</span>
        </button>
      )}

      <button type="button" className={card} onClick={() => setView("device")} disabled={!deviceUsable}>
        <span className="block text-sm font-semibold text-foreground">This device</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{deviceReason}</span>
      </button>

      <button type="button" className={card} onClick={() => setView("code")}>
        <span className="block text-sm font-semibold text-foreground">Use a recovery code</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">Enter one of the codes you saved from Settings.</span>
      </button>

      <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-xs text-foreground">
          None of these work? Resetting by email <strong>erases all data in your account</strong> and starts it empty.
          Your data is encrypted with your password and there is no way to restore it afterwards.
        </p>
        <button
          type="button"
          onClick={() => setView("email")}
          className="mt-3 w-full rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          Reset by email (erases your data)
        </button>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="mb-4 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
      Choose another way
    </button>
  );
}

function SharedComputer({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-border bg-background accent-primary" />
      This is a shared computer
    </label>
  );
}

function ErrorLine({ error }: { error: string }) {
  return error ? (
    <p className="text-sm text-destructive" role="alert" aria-live="assertive">
      {error}
    </p>
  ) : null;
}

// ─── 1. passkey ─────────────────────────────────────────────────────────────

function PasskeyRecovery({ onBack }: { onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isNewPasswordValid(password, confirm)) return;
    setLoading(true);
    setError("");
    try {
      const r = await passkeyRecovery(password, { trustDevice: !shared });
      if (r.ok) {
        hardReload("/dashboard");
        return;
      }
      if (r.code === "prf_unavailable") {
        setError("This passkey can't unlock your data, so it can't reset your password. Try another method.");
      } else if (r.code === "failed") {
        setError(GENERIC_RECOVERY_FAIL);
      }
      // cancelled: silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <BackButton onBack={onBack} />
      <h2 className="text-base font-semibold text-foreground">Reset with a passkey</h2>
      <p className="text-sm text-muted-foreground">Pick a new password, then confirm with your passkey. Your data stays intact.</p>
      <NewPasswordFields idPrefix="pk" password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} />
      <SharedComputer checked={shared} onChange={setShared} />
      <ErrorLine error={error} />
      <button type="submit" className={PRIMARY_BTN} disabled={loading || !isNewPasswordValid(password, confirm)}>
        {loading ? "Waiting for passkey…" : "Continue with passkey"}
      </button>
    </form>
  );
}

// ─── 2. this device ─────────────────────────────────────────────────────────

function DeviceRecovery({ check, onBack }: { check: DeviceCheck | null; onBack: () => void }) {
  const accounts = check?.accounts ?? [];
  const firstUsable = accounts.find((a) => a.available);
  const [deviceId, setDeviceId] = useState(firstUsable?.deviceId ?? "");
  const [proofType, setProofType] = useState<"totp" | "code">(firstUsable?.needs === "code" ? "code" : "totp");
  const [proof, setProof] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = accounts.find((a) => a.deviceId === deviceId);

  function pick(a: DeviceAccount) {
    setDeviceId(a.deviceId);
    setProofType(a.needs === "code" ? "code" : "totp");
    setProof("");
    setError("");
  }

  const proofReady = proofType === "totp" ? /^\d{6}$/.test(proof) : recoveryCodeComplete(proof);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !proofReady || !isNewPasswordValid(password, confirm)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/recovery/device/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: password,
          deviceId: selected.deviceId,
          proof: { type: proofType, value: proofType === "totp" ? proof : proof.trim() },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        hardReload("/dashboard");
        return;
      }
      setError(res.status === 429 ? "Too many attempts. Please try again later." : data?.code === "proof-required" ? "Enter your authenticator or recovery code." : GENERIC_RECOVERY_FAIL);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!firstUsable) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <p className="text-sm text-muted-foreground">This browser can&apos;t be used to reset a password.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <BackButton onBack={onBack} />
      <h2 className="text-base font-semibold text-foreground">Reset from this device</h2>
      <p className="text-sm text-muted-foreground">
        This browser is trusted. Prove it&apos;s you with a code, then pick a new password. Your data stays intact.
      </p>

      {accounts.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Which account?</legend>
          {accounts.map((a) => (
            <label key={a.deviceId} className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm ${a.available ? "" : "opacity-50"}`}>
              <input
                type="radio"
                name="device-account"
                value={a.deviceId}
                checked={deviceId === a.deviceId}
                disabled={!a.available}
                onChange={() => pick(a)}
                className="accent-primary"
              />
              <span className="font-mono">{a.account}</span>
              {!a.available && <span className="text-xs text-muted-foreground">(not set up for recovery)</span>}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-foreground">
          Account: <span className="font-mono">{firstUsable.account}</span>
        </p>
      )}

      <div>
        <label htmlFor="device-proof" className="mb-1.5 block text-sm font-medium text-foreground">
          {proofType === "totp" ? "Authenticator code (6 digits)" : "Recovery code"}
        </label>
        {proofType === "totp" ? (
          <input
            id="device-proof"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            value={proof}
            onChange={(e) => setProof(e.target.value.replace(/\D/g, ""))}
            className={AUTH_INPUT_CLASS}
          />
        ) : (
          <input
            id="device-proof"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            value={proof}
            onChange={(e) => setProof(formatRecoveryInput(e.target.value))}
            className={`${AUTH_INPUT_CLASS} font-mono`}
          />
        )}
        {selected?.needs === "totp" && (
          <button
            type="button"
            onClick={() => { setProofType(proofType === "totp" ? "code" : "totp"); setProof(""); }}
            className="mt-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {proofType === "totp" ? "Use a recovery code instead" : "Use an authenticator code instead"}
          </button>
        )}
      </div>

      <NewPasswordFields idPrefix="dev" password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} />
      <ErrorLine error={error} />
      <button type="submit" className={PRIMARY_BTN} disabled={loading || !selected || !proofReady || !isNewPasswordValid(password, confirm)}>
        {loading ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

// ─── 3. recovery code ───────────────────────────────────────────────────────

function CodeRecovery({ onBack }: { onBack: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ready = identifier.trim().length > 0 && recoveryCodeComplete(code) && isNewPasswordValid(password, confirm);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/recovery/code/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          recoveryCode: code.trim(),
          newPassword: password,
          trustDevice: !shared,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        hardReload("/dashboard");
        return;
      }
      setError(res.status === 429 ? "Too many attempts. Please try again later." : data?.error || GENERIC_RECOVERY_FAIL);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <BackButton onBack={onBack} />
      <h2 className="text-base font-semibold text-foreground">Reset with a recovery code</h2>
      <p className="text-sm text-muted-foreground">Each code works once. Your data stays intact.</p>
      <div>
        <label htmlFor="rc-identifier" className="mb-1.5 block text-sm font-medium text-foreground">
          Email or username
        </label>
        <input
          id="rc-identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
          className={AUTH_INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="rc-code" className="mb-1.5 block text-sm font-medium text-foreground">
          Recovery code
        </label>
        <input
          id="rc-code"
          value={code}
          onChange={(e) => setCode(formatRecoveryInput(e.target.value))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          required
          className={`${AUTH_INPUT_CLASS} font-mono`}
        />
      </div>
      <NewPasswordFields idPrefix="rc" password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} />
      <SharedComputer checked={shared} onChange={setShared} />
      <ErrorLine error={error} />
      <button type="submit" className={PRIMARY_BTN} disabled={loading || !ready}>
        {loading ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

// ─── 4. email (erases data) ─────────────────────────────────────────────────

function EmailReset({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
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
        setMessage(data.message || "If an account with that email exists, a password reset link has been sent.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />
      <h2 className="text-base font-semibold text-foreground">Reset by email</h2>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200/90" role="note">
        Your data is encrypted with your password and there is no recovery key. Resetting the password by email{" "}
        <strong>erases all data in the account</strong> and starts it empty. If you still know your password, change it in
        Settings → Account instead — that keeps your data.
      </div>
      {message ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">{message}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
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
              className={AUTH_INPUT_CLASS}
            />
          </div>
          <ErrorLine error={error} />
          <button type="submit" disabled={loading || email.trim().length === 0} className={PRIMARY_BTN}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </div>
  );
}
