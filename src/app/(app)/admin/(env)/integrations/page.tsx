"use client";

/**
 * /admin/integrations — Email is the first section: status, test send, and an
 * edit form (DB override > env). Secrets are write-only: inputs stay empty and
 * show a "Saved ✓ (database|environment)" hint. Saving prompts for step-up
 * (TOTP, or password when the admin has no MFA).
 */

import { useCallback, useEffect, useState } from "react";
import { SectionPage } from "@/components/templates/section-page";
import { TW } from "@/lib/design/tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Mail, Send, Settings } from "lucide-react";
import { getPasskeyStepUp } from "@/lib/client/passkey-stepup";
import { Field } from "@/components/ui/field";
import { ListRow } from "@/components/mobile";
import { InfoTip } from "@/components/ui/info-tip";
import { Card } from "@/components/ui/card";

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
    resend: "bg-info/15 text-info",
    brevo: "bg-pos/15 text-pos",
    smtp: "bg-chart-5/15 text-chart-5",
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

  if (loading) {
    return (
      <SectionPage id="admin-integrations" title="Integrations" width="report" center>
        <Card>
          <p className="text-sm">Loading...</p>
        </Card>
      </SectionPage>
    );
  }

  const noticeBox = (n: Notice) => (
    <div
      role={n.ok ? "status" : "alert"}
      className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
        n.ok ? "bg-pos/15 text-pos" : "bg-destructive/15 text-destructive"
      }`}
    >
      {n.ok ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
      <div className="flex-1">{n.message}</div>
    </div>
  );

  return (
    <SectionPage id="admin-integrations" title="Integrations" width="report" center>
      {error && (
        <Card>
          <div className="flex items-start gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        </Card>
      )}

      {!error && status && (
        <div data-slot="integration-cards" className={TW.grid3}>
          <Card title="Email Transport Status" icon={Mail} tone="cyan" className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="font-medium">Active provider</span>
              </div>
              <Badge className={providerColor(status.provider)}>{providerLabel(status.provider)}</Badge>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">From address</span>
              <div className="p-3 bg-muted/50 rounded-lg font-mono text-sm break-all">
                {status.from.name} &lt;{status.from.address}&gt;
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">Configured providers</span>
              <ul className="-mx-3 @[11rem]:-mx-5 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                {(["resend", "brevo", "smtp"] as const).map((p) => (
                  <li key={p}>
                    <ListRow
                      aria-label={`${providerLabel(p)} ${status.configured[p] ? "configured" : "not configured"}`}
                      leading={
                        status.configured[p] ? (
                          <CheckCircle2 className="w-4 h-4 text-pos" aria-hidden />
                        ) : (
                          <span aria-hidden className="w-4 h-4 rounded-full border border-muted-foreground" />
                        )
                      }
                      title={providerLabel(p)}
                      value={<span className="text-xs text-muted-foreground">{status.configured[p] ? "Configured" : "Not configured"}</span>}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card
            title={
              <>
                Settings
                <InfoTip
                  label="About settings"
                  text="Values saved here override the server environment. Secrets are write-only: leave a field empty to keep it."
                />
              </>
            }
            icon={Settings}
            tone="muted"
            className="space-y-4"
          >
            <div className="grid gap-4">
              <Field
                label="Provider"
                control="select"
                id="email-provider"
                value={provider}
                onValueChange={(v) => setProvider(v)}
                compact
                options={[
                  { value: "auto", label: "Auto (Resend, then Brevo, then SMTP)" },
                  { value: "resend", label: "Resend" },
                  { value: "brevo", label: "Brevo" },
                  { value: "smtp", label: "SMTP" },
                ]}
              />
              <Field
                label="From"
                id="email-from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="Finlynq <noreply@finlynq.com>"
              />
              <Field
                label="SMTP host"
                id="email-smtp-host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
              <Field
                label="SMTP port"
                id="email-smtp-port"
                inputMode="numeric"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
              {SECRETS.map(({ field, label }) => {
                const src = status.sources[field] as Source | undefined;
                const saved = src === "db" || src === "env";
                return (
                  <div key={field} className="space-y-2">
                    <Field
                      label={label}
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
                    <Field
                      label={status.stepUp === "password" ? "Confirm with your password" : "Confirm with your 6-digit authenticator code"}
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
                  <Field
                    label="Send test to"
                    optional
                    id="email-save-test-to"
                    type="email"
                    value={saveTestTo}
                    onChange={(e) => setSaveTestTo(e.target.value)}
                  />
                )}
                <div className="flex flex-wrap gap-2">
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
              <div className="flex flex-wrap gap-2">
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
          </Card>

          {status.provider !== "none" ? (
            <Card title="Send a test email" icon={Send} tone="indigo">
              <form onSubmit={sendTest} className="space-y-4">
                <Field
                  label="To"
                  id="test-to"
                  type="email"
                  placeholder="Enter email address"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  disabled={sending}
                />
                {result && (
                  <div
                    role={result.ok ? "status" : "alert"}
                    className={`p-3 rounded-lg text-sm ${
                      result.ok ? "bg-pos/15 text-pos" : "bg-destructive/15 text-destructive"
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
            </Card>
          ) : (
            <Card>
              <div className="flex items-start gap-3 text-muted-foreground">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>No email provider configured</div>
              </div>
            </Card>
          )}
        </div>
      )}
    </SectionPage>
  );
}
