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
import { ListRow, SectionCard } from "@/components/mobile";
import { SectionPage } from "@/components/templates/section-page";
import { TW } from "@/lib/design/tokens";
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
    env: "bg-info/10 text-info",
    db: "bg-chart-5/10 text-chart-5",
    default: "bg-muted text-foreground",
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

/** One config value: label, masked/display value, and its origin badge (a native ListRow, no table). */
function ConfigRow({ label, value, source }: ConfigRowProps) {
  return (
    <li>
      <ListRow
        title={label}
        value={<span className="text-sm text-muted-foreground font-mono break-all">{value}</span>}
        secondary={<SourceBadge source={source} />}
        chevron={false}
      />
    </li>
  );
}

interface SectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function ConfigSection({ title, description, children }: SectionProps) {
  return (
    <SectionCard label={title}>
      <p className="text-sm text-muted-foreground mb-2">{description}</p>
      <ul className="flex flex-col divide-y divide-border/60">{children}</ul>
    </SectionCard>
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
    <SectionPage id="admin-instance" title="Instance config" width="report" center>
      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">Loading configuration...</div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          <p className="text-sm font-medium">Error loading configuration</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {config && (
        <div data-slot="instance-sections" className={TW.grid3}>
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
          <div className="col-span-full rounded-lg bg-info/10 p-4 text-info">
            <p className="text-sm font-medium">Configuration precedence</p>
            <p className="text-sm mt-1">
              Environment variables override database settings, which override built-in defaults.
              Secrets are masked above for security.
            </p>
          </div>
        </div>
      )}
    </SectionPage>
  );
}
