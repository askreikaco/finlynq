"use client";

/**
 * /admin/integrations — admin integrations overview.
 * First section: Email transport status and test send.
 * Gated server-side by requireAdmin + session-only.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plug, CheckCircle2, AlertCircle } from "lucide-react";

interface EmailStatus {
  provider: "resend" | "brevo" | "smtp" | "none";
  from: { name: string; address: string };
  configured: {
    brevo: boolean;
    resend: boolean;
    smtp: boolean;
  };
  smtpHost?: string;
}

const STRINGS = {
  title: "Integrations",
  emailSection: "Email",
  statusCard: "Email Transport Status",
  activeProvider: "Active provider",
  fromAddress: "From address",
  configuration: "Configuration",
  configuredProviders: "Configured providers",
  explanation:
    "API keys and SMTP credentials are stored in the server's environment variables (.env). Changing them requires a server restart.",
  envVars: "Environment variables: BREVO_API_KEY, RESEND_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM",
  testEmailSection: "Send a test email",
  toLabel: "To",
  toPlaceholder: "Enter email address",
  sendButton: "Send",
  sending: "Sending...",
  success: "Test email sent successfully",
  error: "Failed to send test email",
  rateLimitError: "Rate limited: try again in a few minutes",
  noProvider: "No email provider configured",
  successDetails: (provider: string) => `Sent via ${provider}`,
  brevo: "Brevo",
  resend: "Resend",
  smtp: "SMTP",
  none: "None",
};

export default function AdminIntegrationsPage() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; provider?: string } | null>(null);

  const fetchStatus = async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/integrations/email");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load status");
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

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
        setResult({
          ok: false,
          message: data.error || STRINGS.error,
        });
      } else {
        setResult({
          ok: true,
          message: STRINGS.success,
          provider: data.provider,
        });
        setTestTo("");
      }
    } catch (e) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : STRINGS.error,
      });
    } finally {
      setSending(false);
    }
  };

  const getProviderBadgeColor = (provider: string): string => {
    switch (provider) {
      case "resend":
        return "bg-blue-500/15 text-blue-600";
      case "brevo":
        return "bg-green-500/15 text-green-600";
      case "smtp":
        return "bg-purple-500/15 text-purple-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getProviderLabel = (provider: string): string => {
    switch (provider) {
      case "resend":
        return STRINGS.resend;
      case "brevo":
        return STRINGS.brevo;
      case "smtp":
        return STRINGS.smtp;
      default:
        return STRINGS.none;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Plug className="w-8 h-8" />
            {STRINGS.title}
          </h1>
        </div>
        <Card>
          <CardContent className="pt-6">Loading...</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Plug className="w-8 h-8" />
          {STRINGS.title}
        </h1>
      </div>

      {/* Email Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{STRINGS.emailSection}</h2>

        {error && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-destructive">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>{error}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Card */}
        {!error && status && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{STRINGS.statusCard}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span className="font-medium">{STRINGS.activeProvider}</span>
                </div>
                <Badge className={getProviderBadgeColor(status.provider)}>
                  {getProviderLabel(status.provider)}
                </Badge>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  {STRINGS.fromAddress}
                </Label>
                <div className="p-3 bg-muted/50 rounded-lg font-mono text-sm">
                  {status.from.name} &lt;{status.from.address}&gt;
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  {STRINGS.configuredProviders}
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    {status.configured.resend ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-muted-foreground" />
                    )}
                    <span className="text-sm">{STRINGS.resend}</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    {status.configured.brevo ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-muted-foreground" />
                    )}
                    <span className="text-sm">{STRINGS.brevo}</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    {status.configured.smtp ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-muted-foreground" />
                    )}
                    <span className="text-sm">{STRINGS.smtp}</span>
                  </div>
                </div>
                {status.smtpHost && (
                  <div className="text-xs text-muted-foreground mt-2">
                    SMTP Host: <span className="font-mono">{status.smtpHost}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Configuration Info */}
        {!error && status && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">{STRINGS.configuration}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{STRINGS.explanation}</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
                {STRINGS.envVars}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Test Email Form */}
        {!error && status && status.provider !== "none" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{STRINGS.testEmailSection}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={sendTest} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="test-to" className="text-sm">
                    {STRINGS.toLabel}
                  </Label>
                  <Input
                    id="test-to"
                    type="email"
                    placeholder={STRINGS.toPlaceholder}
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    disabled={sending}
                    defaultValue={`${status.from.address}`}
                    aria-label={STRINGS.toLabel}
                  />
                </div>

                {result && (
                  <div
                    role={result.ok ? "status" : "alert"}
                    className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                      result.ok
                        ? "bg-green-500/15 text-green-600"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {result.ok ? (
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      {result.message}
                      {result.provider && (
                        <div className="text-xs mt-1 opacity-75">
                          {STRINGS.successDetails(getProviderLabel(result.provider))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={sending || !testTo.trim()}
                  className="w-full"
                >
                  {sending ? STRINGS.sending : STRINGS.sendButton}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {!error && status && status.provider === "none" && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-muted-foreground">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>{STRINGS.noProvider}</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
