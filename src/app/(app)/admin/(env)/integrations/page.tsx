"use client";

/**
 * /admin/integrations — Email is the first section: status, test send, and an
 * edit form (DB override > env). Secrets are write-only: inputs stay empty and
 * show a "Saved ✓ (database|environment)" hint. Saving prompts for step-up
 * (TOTP, or password when the admin has no MFA).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plug, CheckCircle2, AlertCircle } from "lucide-react";
import { getPasskeyStepUp } from "@/lib/client/passkey-stepup";

type Source = "db" | "env" | "none";
type SecretField = "brevoApiKey" | "resendApiKey" | "smtpUser" | "smtpPass";

interface EmailStatus {
  provider: "resend" | "brevo" | "smtp" | "none";
  from: { name: string; address: string };
  configured: { brevo: boolean; resend: boolean; smtp: boolean };
  sources: Record<string, Source>;
  values: { provider: string; from: string; smtpHost: string; smtpPort: number | null };
  stepUp: "mfa" | "password" | "passkey";
  canRevert: boolean;
}

const SECRETS: { field: SecretField; label: string }[] = [
  { field: "brevoApiKey", label: "Brevo API key" },
  { field: "resendApiKey", label: "Resend API key" },
  { field: "smtpUser", label: "SMTP user" },
  { field: "smtpPass", label: "SMTP password" },
];

const providerLabel = (p: string) =>
  ({ resend: "Resend", brevo: "Brevo", smtp: "SMTP" })[p as "resend"] ?? "None";
const providerColor = (p: string) =>
  ({
    resend: "bg-blue-500/15 text-blue-600",
    brevo: "bg-green-500/15 text-green-600",
    smtp: "bg-purple-500/15 text-purple-600",
  })[p as "resend"] ?? "bg-muted text-muted-foreground";
const sourceLabel = (s: Source) => (s === "db" ? "database" : "environment");

interface Notice {
  ok: boolean;
  message: string;
}

export default function AdminIntegrationsPage() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // test send
  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<(Notice & { provider?: string }) | null>(null);

  // settings form
  const [provider, setProvider] = useState("auto");
  const [from, setFrom] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [secretInput, setSecretInput] = useState<Record<SecretField, string>>({
    brevoApiKey: "",
    resendApiKey: "",
    smtpUser: "",
    smtpPass: "",
  });
  const [cleared, setCleared] = useState<Partial<Record<SecretField, boolean>>>({});
  const [stepOpen, setStepOpen] = useState<null | "save" | "revert">(null);
  const [stepValue, setStepValue] = useState("");
  const [saveTestTo, setSaveTestTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<Notice | null>(null);
  const [saveTestResult, setSaveTestResult] = useState<Notice | null>(null);

  const syncForm = (s: EmailStatus) => {
    setProvider(s.values.provider || "auto");
    setFrom(s.values.from);
    setSmtpHost(s.values.smtpHost);
    setSmtpPort(s.values.smtpPort ? String(s.values.smtpPort) : "");
    setSecretInput({ brevoApiKey: "", resendApiKey: "", smtpUser: "", smtpPass: "" });
    setCleared({});
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/integrations/email");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load status");
      setError(null);
      setStatus(data);
      syncForm(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTo.trim()) {
      setResult({ ok: false, message: "Email address is required" });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/integrations/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error || "Failed to send test email" });
      } else {
        setResult({ ok: true, message: "Test email sent successfully", provider: data.provider });
        setTestTo("");
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Failed to send test email" });
    } finally {
      setSending(false);
    }
  };

  /** Only fields the admin actually changed. Secrets: typed = replace, Clear = null. */
  const buildChanges = (s: EmailStatus): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    if (provider !== (s.values.provider || "auto")) c.provider = provider;
    if (from.trim() !== s.values.from) c.from = from.trim() === "" ? null : from.trim();
    if (smtpHost.trim() !== s.values.smtpHost) c.smtpHost = smtpHost.trim() === "" ? null : smtpHost.trim();
    const portStr = s.values.smtpPort ? String(s.values.smtpPort) : "";
    if (smtpPort.trim() !== portStr) c.smtpPort = smtpPort.trim() === "" ? null : Number(smtpPort);
    for (const { field } of SECRETS) {
      if (secretInput[field] !== "") c[field] = secretInput[field];
      else if (cleared[field]) c[field] = null;
    }
    return c;
  };

  // Passkey-only admin: a fresh passkey assertion (single use per request) replaces the typed code.
  const stepPayload = async (): Promise<Record<string, unknown> | null> => {
    if (status?.stepUp === "passkey") {
      const r = await getPasskeyStepUp("admin-email-integration");
      return r.ok ? { passkeyStepUp: r.passkeyStepUp } : null;
    }
    return status?.stepUp === "password" ? { password: stepValue } : { mfaCode: stepValue };
  };
  const stepReady = status?.stepUp === "passkey" || !!stepValue;

  const submitSave = async (withTest: boolean) => {
    if (!status) return;
    const changes = buildChanges(status);
    if (Object.keys(changes).length === 0) {
      setSaveNotice({ ok: false, message: "No changes to save" });
      setStepOpen(null);
      return;
    }
    setBusy(true);
    setSaveNotice(null);
    setSaveTestResult(null);
    try {
      const step = await stepPayload();
      if (!step) {
        setSaveNotice({ ok: false, message: "Passkey confirmation was cancelled or failed" });
        return;
      }
      const res = await fetch("/api/admin/integrations/email/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...changes,
          ...step,
          ...(withTest && saveTestTo.trim() ? { testTo: saveTestTo.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveNotice({ ok: false, message: data.error || "Failed to save settings" });
        return;
      }
      setSaveNotice({ ok: true, message: "Settings saved" });
      if (data.test) {
        setSaveTestResult(
          data.test.ok
            ? { ok: true, message: `Test email sent via ${providerLabel(data.test.provider)}` }
            : { ok: false, message: data.test.error || "Test email failed" },
        );
      }
      setStepOpen(null);
      setStepValue("");
      await fetchStatus();
    } catch (err) {
      setSaveNotice({ ok: false, message: err instanceof Error ? err.message : "Failed to save settings" });
    } finally {
      setBusy(false);
    }
  };

  const submitRevert = async () => {
    setBusy(true);
    setSaveNotice(null);
    setSaveTestResult(null);
    try {
      const step = await stepPayload();
      if (!step) {
        setSaveNotice({ ok: false, message: "Passkey confirmation was cancelled or failed" });
        return;
      }
      const res = await fetch("/api/admin/integrations/email/settings/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(step),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveNotice({ ok: false, message: data.error || "Failed to revert" });
        return;
      }
      setSaveNotice({ ok: true, message: "Reverted to the previous settings" });
      setStepOpen(null);
      setStepValue("");
      await fetchStatus();
    } catch (err) {
      setSaveNotice({ ok: false, message: err instanceof Error ? err.message : "Failed to revert" });
    } finally {
      setBusy(false);
    }
  };

  const Heading = (
    <div className="mb-6">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
        <Plug className="w-8 h-8" />
        Integrations
      </h1>
    </div>
  );

  if (loading) {
    return (
      <div className="p-6">
        {Heading}
        <Card>
          <CardContent className="pt-6">Loading...</CardContent>
        </Card>
      </div>
    );
  }

  const noticeBox = (n: Notice) => (
    <div
      role={n.ok ? "status" : "alert"}
      className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
        n.ok ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive"
      }`}
    >
      {n.ok ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
      <div className="flex-1">{n.message}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl">
      {Heading}

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Email</h2>

        {error && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-destructive">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>{error}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {!error && status && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Email Transport Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="font-medium">Active provider</span>
                  </div>
                  <Badge className={providerColor(status.provider)}>{providerLabel(status.provider)}</Badge>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">From address</Label>
                  <div className="p-3 bg-muted/50 rounded-lg font-mono text-sm">
                    {status.from.name} &lt;{status.from.address}&gt;
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Configured providers</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["resend", "brevo", "smtp"] as const).map((p) => (
                      <div key={p} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        {status.configured[p] ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" aria-label={`${providerLabel(p)} configured`} />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-muted-foreground" aria-label={`${providerLabel(p)} not configured`} />
                        )}
                        <span className="text-sm">{providerLabel(p)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Values saved here override the server environment. Secrets are write-only: leave a field empty to keep it.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email-provider">Provider</Label>
                    <select
                      id="email-provider"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    >
                      <option value="auto">Auto (Resend, then Brevo, then SMTP)</option>
                      <option value="resend">Resend</option>
                      <option value="brevo">Brevo</option>
                      <option value="smtp">SMTP</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-from">From</Label>
                    <Input id="email-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Finlynq <noreply@finlynq.com>" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-smtp-host">SMTP host</Label>
                    <Input id="email-smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-smtp-port">SMTP port</Label>
                    <Input id="email-smtp-port" inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
                  </div>
                  {SECRETS.map(({ field, label }) => {
                    const src = status.sources[field] as Source | undefined;
                    const saved = src === "db" || src === "env";
                    return (
                      <div key={field} className="space-y-2">
                        <Label htmlFor={`email-${field}`}>{label}</Label>
                        <Input
                          id={`email-${field}`}
                          type="password"
                          autoComplete="new-password"
                          value={secretInput[field]}
                          placeholder={cleared[field] ? "Will be cleared on save" : ""}
                          onChange={(e) => {
                            setSecretInput((s) => ({ ...s, [field]: e.target.value }));
                            setCleared((c) => ({ ...c, [field]: false }));
                          }}
                        />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {saved && !cleared[field] && <span>Saved ✓ ({sourceLabel(src!)})</span>}
                          {src === "db" && !cleared[field] && (
                            <button
                              type="button"
                              className="underline"
                              onClick={() => {
                                setSecretInput((s) => ({ ...s, [field]: "" }));
                                setCleared((c) => ({ ...c, [field]: true }));
                              }}
                              aria-label={`Clear ${label}`}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {saveNotice && noticeBox(saveNotice)}
                {saveTestResult && noticeBox(saveTestResult)}

                {stepOpen ? (
                  <div className="space-y-3 rounded-lg border p-4" role="group" aria-label="Confirm">
                    {status.stepUp === "passkey" ? (
                      <p className="text-sm">You will be asked to confirm with your passkey.</p>
                    ) : (
                      <>
                        <Label htmlFor="email-step-up">
                          {status.stepUp === "password" ? "Confirm with your password" : "Confirm with your 6-digit authenticator code"}
                        </Label>
                        <Input
                          id="email-step-up"
                          type={status.stepUp === "password" ? "password" : "text"}
                          inputMode={status.stepUp === "password" ? undefined : "numeric"}
                          autoComplete="one-time-code"
                          value={stepValue}
                          onChange={(e) => setStepValue(e.target.value)}
                        />
                      </>
                    )}
                    {stepOpen === "save" && (
                      <div className="space-y-2">
                        <Label htmlFor="email-save-test-to">Send test to (optional)</Label>
                        <Input id="email-save-test-to" type="email" value={saveTestTo} onChange={(e) => setSaveTestTo(e.target.value)} />
                      </div>
                    )}
                    <div className="flex gap-2">
                      {stepOpen === "save" ? (
                        <>
                          <Button type="button" disabled={busy || !stepReady} onClick={() => submitSave(false)}>
                            Confirm save
                          </Button>
                          <Button type="button" variant="secondary" disabled={busy || !stepReady || !saveTestTo.trim()} onClick={() => submitSave(true)}>
                            Save &amp; send test
                          </Button>
                        </>
                      ) : (
                        <Button type="button" disabled={busy || !stepReady} onClick={submitRevert}>
                          Confirm revert
                        </Button>
                      )}
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setStepOpen(null); setStepValue(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => { setSaveNotice(null); setStepOpen("save"); }}>
                      Save
                    </Button>
                    {status.canRevert && (
                      <Button type="button" variant="outline" onClick={() => { setSaveNotice(null); setStepOpen("revert"); }}>
                        Revert
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {status.provider !== "none" ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Send a test email</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={sendTest} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="test-to" className="text-sm">To</Label>
                      <Input
                        id="test-to"
                        type="email"
                        placeholder="Enter email address"
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                        disabled={sending}
                      />
                    </div>
                    {result && (
                      <div
                        role={result.ok ? "status" : "alert"}
                        className={`p-3 rounded-lg text-sm ${
                          result.ok ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {result.message}
                        {result.provider && <div className="text-xs mt-1 opacity-75">Sent via {providerLabel(result.provider)}</div>}
                      </div>
                    )}
                    <Button type="submit" disabled={sending || !testTo.trim()} className="w-full">
                      {sending ? "Sending..." : "Send"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3 text-muted-foreground">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>No email provider configured</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
