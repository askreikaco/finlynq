/**
 * Effective config helper (WP9a) — shows instance config values and their sources.
 *
 * Sources:
 * - env: from environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.)
 * - default: built-in defaults when env/db not set
 *
 * Precedence: env > db (when db exists in 9b) > default
 *
 * All secrets are masked in the returned config to prevent leaking in logs/HTML.
 */

import { resolveEmailConfig, activeEmailProvider } from "@/lib/email";

export interface EffectiveConfigEntry {
  value: string | boolean | null; // for secrets, this will be null or a placeholder; never the actual secret
  masked: boolean; // true if the value is a secret and has been masked
  source: "env" | "db" | "default";
  displayValue: string; // for rendering: actual value or "***"
}

export interface EffectiveConfig {
  google: {
    clientId: EffectiveConfigEntry;
    clientSecret: EffectiveConfigEntry;
    enabled: EffectiveConfigEntry;
  };
  passkey: {
    enabled: EffectiveConfigEntry;
  };
  registration: {
    allowOpen: EffectiveConfigEntry; // shows honest "not configurable here" label
  };
  email: {
    enabled: EffectiveConfigEntry; // provider name + configured status, never any key material
  };
  captcha: {
    enabled: EffectiveConfigEntry; // default: false (Turnstile not yet configured)
  };
}

/**
 * Get the effective config by reading environment and applying precedence.
 * WP9a only reads from env; 9b will add DB + config key lookup.
 *
 * All secret fields (clientSecret, etc.) are masked in the returned object.
 * Secret values are NEVER included in the response, only masked placeholders.
 *
 * For email configuration, reads the real provider (Resend, Brevo, SMTP) status
 * instead of just checking SENDGRID_API_KEY.
 *
 * For registration, shows "not configurable here" since no real setting exists yet.
 */
export async function getEffectiveConfig(env: Record<string, string | undefined> = process.env): Promise<EffectiveConfig> {
  const googleClientId = env.GOOGLE_CLIENT_ID ?? null;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET ?? null;
  const googleEnabled = !!(googleClientId && googleClientSecret);

  // Determine real email provider status
  const emailCfg = await resolveEmailConfig();
  const provider = activeEmailProvider(emailCfg);
  const emailConfigured = provider !== "none";
  const providerDisplay = emailConfigured ? `Yes (${provider.charAt(0).toUpperCase() + provider.slice(1)})` : "No";

  return {
    google: {
      clientId: {
        value: googleClientId,
        masked: false,
        source: "env",
        displayValue: googleClientId ? (googleClientId.length > 10 ? googleClientId.slice(0, 10) + "..." : googleClientId) : "(empty)",
      },
      clientSecret: {
        value: null, // NEVER return the actual secret value
        masked: !!googleClientSecret,
        source: "env",
        displayValue: googleClientSecret ? "***" : "(empty)",
      },
      enabled: {
        value: googleEnabled,
        masked: false,
        source: "env",
        displayValue: googleEnabled ? "Yes" : "No",
      },
    },
    passkey: {
      enabled: {
        value: true, // Passkeys are always enabled in Finlynq (WebAuthn is core)
        masked: false,
        source: "default",
        displayValue: "Yes",
      },
    },
    registration: {
      allowOpen: {
        value: null, // Not configurable here yet; no real setting exists
        masked: false,
        source: "default",
        displayValue: "Not configurable here (always open by default)",
      },
    },
    email: {
      enabled: {
        value: emailConfigured, // boolean indicating if any provider is configured
        masked: false,
        source: emailCfg.resendApiKey.source || emailCfg.brevoApiKey.source || emailCfg.smtpHost.source || "default",
        displayValue: providerDisplay,
      },
    },
    captcha: {
      enabled: {
        value: false, // Turnstile not configured yet (WP9b)
        masked: false,
        source: "default",
        displayValue: "No (not configured)",
      },
    },
  };
}
