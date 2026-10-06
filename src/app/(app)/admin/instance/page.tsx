"use client";

/**
 * Instance admin page (WP9a) — read-only view of effective configuration and sources.
 *
 * Shows:
 * - Google OAuth (client ID, secret status, enabled state)
 * - Passkey (WebAuthn, always enabled)
 * - Registration (allow open, default true)
 * - Email (SendGrid integration status)
 * - Captcha (Turnstile, not yet configured)
 *
 * Secrets are masked in the display. Sources indicate env/db/default origin.
 */

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/mobile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EffectiveConfig } from "@/lib/admin/effective-config";

const SECTIONS = [
  {
    id: "google",
    label: "Google OAuth",
    description: "Third-party OIDC provider for sign-in",
  },
  {
    id: "passkey",
    label: "Passkey (WebAuthn)",
    description: "Native security key and biometric sign-in",
  },
  {
    id: "registration",
    label: "Registration",
    description: "Sign-up configuration",
  },
  {
    id: "email",
    label: "Email",
    description: "Outbound email integration",
  },
  {
    id: "captcha",
    label: "CAPTCHA",
    description: "Bot protection on forms",
  },
] as const;

function SourceBadge({ source }: { source: "env" | "db" | "default" }) {
  const colors: Record<string, string> = {
    env: "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
    db: "bg-purple-100 text-purple-900 dark:bg-purple-900 dark:text-purple-100",
    default: "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
  };
  const labels: Record<string, string> = {
    env: "Environment",
    db: "Database",
    default: "Default",
  };
  return <Badge className={colors[source]}>{labels[source]}</Badge>;
}

interface ConfigRowProps {
  label: string;
  value: string;
  source: "env" | "db" | "default";
}

function ConfigRow({ label, value, source }: ConfigRowProps) {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border last:border-b-0">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground font-mono">{value}</span>
        <SourceBadge source={source} />
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function ConfigSection({ title, description, children }: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

export default function InstanceAdminPage() {
  const [config, setConfig] = useState<EffectiveConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        setIsLoading(true);
        const response = await fetch("/api/admin/instance/config");
        if (!response.ok) {
          throw new Error(`Failed to fetch config: ${response.statusText}`);
        }
        const data = await response.json();
        setConfig(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setConfig(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchConfig();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Instance Config" titleClassName="text-2xl font-bold text-foreground" />

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">Loading configuration...</div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-900 dark:text-red-200">
          <p className="text-sm font-medium">Error loading configuration</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {config && (
        <div className="space-y-6">
          {/* Google OAuth Section */}
          <ConfigSection
            title={SECTIONS[0].label}
            description={SECTIONS[0].description}
          >
            <ConfigRow
              label="Client ID"
              value={config.google.clientId.displayValue}
              source={config.google.clientId.source}
            />
            <ConfigRow
              label="Client Secret"
              value={config.google.clientSecret.displayValue}
              source={config.google.clientSecret.source}
            />
            <ConfigRow
              label="Enabled"
              value={config.google.enabled.displayValue}
              source={config.google.enabled.source}
            />
          </ConfigSection>

          {/* Passkey Section */}
          <ConfigSection
            title={SECTIONS[1].label}
            description={SECTIONS[1].description}
          >
            <ConfigRow
              label="Enabled"
              value={config.passkey.enabled.displayValue}
              source={config.passkey.enabled.source}
            />
          </ConfigSection>

          {/* Registration Section */}
          <ConfigSection
            title={SECTIONS[2].label}
            description={SECTIONS[2].description}
          >
            <ConfigRow
              label="Allow open sign-up"
              value={config.registration.allowOpen.displayValue}
              source={config.registration.allowOpen.source}
            />
          </ConfigSection>

          {/* Email Section */}
          <ConfigSection
            title={SECTIONS[3].label}
            description={SECTIONS[3].description}
          >
            <ConfigRow
              label="Enabled"
              value={config.email.enabled.displayValue}
              source={config.email.enabled.source}
            />
          </ConfigSection>

          {/* Captcha Section */}
          <ConfigSection
            title={SECTIONS[4].label}
            description={SECTIONS[4].description}
          >
            <ConfigRow
              label="Enabled"
              value={config.captcha.enabled.displayValue}
              source={config.captcha.enabled.source}
            />
          </ConfigSection>

          {/* Info note */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-blue-900 dark:text-blue-200">
            <p className="text-sm font-medium">Configuration precedence</p>
            <p className="text-sm mt-1">
              Environment variables override database settings, which override built-in defaults.
              Secrets are masked above for security.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
