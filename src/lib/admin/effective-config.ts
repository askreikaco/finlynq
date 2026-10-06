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
    allowOpen: EffectiveConfigEntry; // default: true
  };
  email: {
    enabled: EffectiveConfigEntry;
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
 */
export function getEffectiveConfig(env: Record<string, string | undefined> = process.env): EffectiveConfig {
  const googleClientId = env.GOOGLE_CLIENT_ID ?? null;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET ?? null;
  const googleEnabled = !!(googleClientId && googleClientSecret);
  const sendgridEnabled = !!env.SENDGRID_API_KEY;

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
        value: true, // Default: open registration unless overridden in 9b
        masked: false,
        source: "default",
        displayValue: "Yes (default)",
      },
    },
    email: {
      enabled: {
        value: sendgridEnabled,
        masked: false,
        source: "env",
        displayValue: sendgridEnabled ? "Yes" : "No",
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
