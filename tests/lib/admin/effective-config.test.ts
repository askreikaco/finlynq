import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getEffectiveConfig } from "@/lib/admin/effective-config";

// Mock the email module to avoid DB calls
vi.mock("@/lib/email", () => ({
  resolveEmailConfig: vi.fn(),
  activeEmailProvider: vi.fn(),
}));

import { resolveEmailConfig, activeEmailProvider } from "@/lib/email";

const mockResolveEmailConfig = resolveEmailConfig as ReturnType<typeof vi.fn>;
const mockActiveEmailProvider = activeEmailProvider as ReturnType<typeof vi.fn>;

describe("getEffectiveConfig", () => {
  beforeEach(() => {
    // Default mocks: no email configured
    mockResolveEmailConfig.mockResolvedValue({
      provider: { value: undefined, source: "none" },
      from: { value: undefined, source: "none" },
      brevoApiKey: { value: undefined, source: "none" },
      resendApiKey: { value: undefined, source: "none" },
      smtpHost: { value: undefined, source: "none" },
      smtpPort: { value: undefined, source: "none" },
      smtpUser: { value: undefined, source: "none" },
      smtpPass: { value: undefined, source: "none" },
    });
    mockActiveEmailProvider.mockReturnValue("none");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns defaults when env is empty", async () => {
    const config = await getEffectiveConfig({});

    expect(config.google.clientId.value).toBeNull();
    expect(config.google.clientSecret.value).toBeNull();
    expect(config.google.enabled.value).toBe(false);
    expect(config.passkey.enabled.value).toBe(true);
    expect(config.registration.allowOpen.value).toBeNull();
    expect(config.registration.allowOpen.displayValue).toBe("Not configurable here (always open by default)");
    expect(config.email.enabled.value).toBe(false);
    expect(config.captcha.enabled.value).toBe(false);
  });

  it("reads GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from env", async () => {
    const config = await getEffectiveConfig({
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
    });

    expect(config.google.clientId.value).toBe("test-client-id");
    expect(config.google.clientSecret.value).toBeNull(); // Secret value is never returned
    expect(config.google.clientSecret.masked).toBe(true);
    expect(config.google.enabled.value).toBe(true);
  });

  it("enables Google only when both clientId and clientSecret are set", async () => {
    const configIdOnly = await getEffectiveConfig({
      GOOGLE_CLIENT_ID: "test-id",
    });
    expect(configIdOnly.google.enabled.value).toBe(false);

    const configSecretOnly = await getEffectiveConfig({
      GOOGLE_CLIENT_SECRET: "test-secret",
    });
    expect(configSecretOnly.google.enabled.value).toBe(false);

    const configBoth = await getEffectiveConfig({
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
    });
    expect(configBoth.google.enabled.value).toBe(true);
  });

  it("detects Resend email provider from RESEND_API_KEY", async () => {
    mockResolveEmailConfig.mockResolvedValue({
      provider: { value: undefined, source: "none" },
      from: { value: undefined, source: "none" },
      brevoApiKey: { value: undefined, source: "none" },
      resendApiKey: { value: "SENTINEL_SECRET_resend123", source: "env" },
      smtpHost: { value: undefined, source: "none" },
      smtpPort: { value: undefined, source: "none" },
      smtpUser: { value: undefined, source: "none" },
      smtpPass: { value: undefined, source: "none" },
    });
    mockActiveEmailProvider.mockReturnValue("resend");

    const config = await getEffectiveConfig({
      RESEND_API_KEY: "SENTINEL_SECRET_resend123",
    });

    expect(config.email.enabled.value).toBe(true);
    expect(config.email.enabled.displayValue).toBe("Yes (Resend)");
  });

  it("detects Brevo email provider from BREVO_API_KEY", async () => {
    mockResolveEmailConfig.mockResolvedValue({
      provider: { value: undefined, source: "none" },
      from: { value: undefined, source: "none" },
      brevoApiKey: { value: "SENTINEL_SECRET_brevo456", source: "env" },
      resendApiKey: { value: undefined, source: "none" },
      smtpHost: { value: undefined, source: "none" },
      smtpPort: { value: undefined, source: "none" },
      smtpUser: { value: undefined, source: "none" },
      smtpPass: { value: undefined, source: "none" },
    });
    mockActiveEmailProvider.mockReturnValue("brevo");

    const config = await getEffectiveConfig({
      BREVO_API_KEY: "SENTINEL_SECRET_brevo456",
    });

    expect(config.email.enabled.value).toBe(true);
    expect(config.email.enabled.displayValue).toBe("Yes (Brevo)");
  });

  it("detects SMTP email provider from SMTP_HOST", async () => {
    mockResolveEmailConfig.mockResolvedValue({
      provider: { value: undefined, source: "none" },
      from: { value: undefined, source: "none" },
      brevoApiKey: { value: undefined, source: "none" },
      resendApiKey: { value: undefined, source: "none" },
      smtpHost: { value: "smtp.example.com", source: "env" },
      smtpPort: { value: "587", source: "env" },
      smtpUser: { value: "SENTINEL_SECRET_user", source: "env" },
      smtpPass: { value: "SENTINEL_SECRET_pass", source: "env" },
    });
    mockActiveEmailProvider.mockReturnValue("smtp");

    const config = await getEffectiveConfig({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "SENTINEL_SECRET_user",
      SMTP_PASS: "SENTINEL_SECRET_pass",
    });

    expect(config.email.enabled.value).toBe(true);
    expect(config.email.enabled.displayValue).toBe("Yes (Smtp)");
  });

  it("shows 'No' for email when no provider is configured", async () => {
    mockActiveEmailProvider.mockReturnValue("none");

    const config = await getEffectiveConfig({});

    expect(config.email.enabled.value).toBe(false);
    expect(config.email.enabled.displayValue).toBe("No");
  });

  it("masks secrets in displayValue and never leaks value", async () => {
    const config = await getEffectiveConfig({
      GOOGLE_CLIENT_SECRET: "super-secret-key-12345",
    });

    expect(config.google.clientSecret.value).toBeNull(); // Secret value is never returned
    expect(config.google.clientSecret.masked).toBe(true);
    expect(config.google.clientSecret.displayValue).toBe("***");
  });

  it("does not mask client IDs", async () => {
    const config = await getEffectiveConfig({
      GOOGLE_CLIENT_ID: "123456.apps.googleusercontent.com",
    });

    expect(config.google.clientId.masked).toBe(false);
    expect(config.google.clientId.displayValue).toContain("123456");
  });

  it("truncates long client IDs for display", async () => {
    const config = await getEffectiveConfig({
      GOOGLE_CLIENT_ID: "123456789012345678901234567890",
    });

    expect(config.google.clientId.displayValue).toBe("1234567890...");
  });

  it("shows empty display value when secret is empty", async () => {
    const config = await getEffectiveConfig({});

    expect(config.google.clientSecret.value).toBeNull();
    expect(config.google.clientSecret.displayValue).toBe("(empty)");
  });

  it("sets correct source for all fields", async () => {
    mockResolveEmailConfig.mockResolvedValue({
      provider: { value: undefined, source: "none" },
      from: { value: undefined, source: "none" },
      brevoApiKey: { value: undefined, source: "none" },
      resendApiKey: { value: "SENTINEL_SECRET_test", source: "env" },
      smtpHost: { value: undefined, source: "none" },
      smtpPort: { value: undefined, source: "none" },
      smtpUser: { value: undefined, source: "none" },
      smtpPass: { value: undefined, source: "none" },
    });
    mockActiveEmailProvider.mockReturnValue("resend");

    const config = await getEffectiveConfig({
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
      RESEND_API_KEY: "SENTINEL_SECRET_test",
    });

    expect(config.google.clientId.source).toBe("env");
    expect(config.google.clientSecret.source).toBe("env");
    expect(config.google.enabled.source).toBe("env");
    expect(config.passkey.enabled.source).toBe("default");
    expect(config.registration.allowOpen.source).toBe("default");
    expect(config.email.enabled.source).toBe("env");
    expect(config.captcha.enabled.source).toBe("default");
  });

  it("shows honest registration label when not configurable", async () => {
    const config = await getEffectiveConfig({});

    expect(config.registration.allowOpen.value).toBeNull();
    expect(config.registration.allowOpen.displayValue).toBe("Not configurable here (always open by default)");
    expect(config.registration.allowOpen.source).toBe("default");
  });

  it("never leaks secrets in the whole config object", async () => {
    mockResolveEmailConfig.mockResolvedValue({
      provider: { value: undefined, source: "none" },
      from: { value: undefined, source: "none" },
      brevoApiKey: { value: undefined, source: "none" },
      resendApiKey: { value: "SENTINEL_SECRET_should_not_leak", source: "env" },
      smtpHost: { value: undefined, source: "none" },
      smtpPort: { value: undefined, source: "none" },
      smtpUser: { value: undefined, source: "none" },
      smtpPass: { value: undefined, source: "none" },
    });
    mockActiveEmailProvider.mockReturnValue("resend");

    const config = await getEffectiveConfig({
      GOOGLE_CLIENT_SECRET: "super-secret-should-not-leak",
      RESEND_API_KEY: "SENTINEL_SECRET_should_not_leak",
    });

    // Serialize to JSON and verify no secrets appear
    const json = JSON.stringify(config);
    expect(json).not.toContain("super-secret-should-not-leak");
    expect(json).not.toContain("SENTINEL_SECRET_should_not_leak");
    // Only "***" should appear for masked secrets
    expect(json).toContain("***");
  });

  it("never leaks secrets for Brevo provider", async () => {
    mockResolveEmailConfig.mockResolvedValue({
      provider: { value: undefined, source: "none" },
      from: { value: undefined, source: "none" },
      brevoApiKey: { value: "SENTINEL_SECRET_brevo_should_not_leak", source: "env" },
      resendApiKey: { value: undefined, source: "none" },
      smtpHost: { value: undefined, source: "none" },
      smtpPort: { value: undefined, source: "none" },
      smtpUser: { value: undefined, source: "none" },
      smtpPass: { value: undefined, source: "none" },
    });
    mockActiveEmailProvider.mockReturnValue("brevo");

    const config = await getEffectiveConfig({
      BREVO_API_KEY: "SENTINEL_SECRET_brevo_should_not_leak",
    });

    const json = JSON.stringify(config);
    expect(json).not.toContain("SENTINEL_SECRET_brevo_should_not_leak");
  });

  it("never leaks secrets for SMTP provider", async () => {
    mockResolveEmailConfig.mockResolvedValue({
      provider: { value: undefined, source: "none" },
      from: { value: undefined, source: "none" },
      brevoApiKey: { value: undefined, source: "none" },
      resendApiKey: { value: undefined, source: "none" },
      smtpHost: { value: "smtp.example.com", source: "env" },
      smtpPort: { value: "587", source: "env" },
      smtpUser: { value: "SENTINEL_SECRET_user", source: "env" },
      smtpPass: { value: "SENTINEL_SECRET_pass", source: "env" },
    });
    mockActiveEmailProvider.mockReturnValue("smtp");

    const config = await getEffectiveConfig({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "SENTINEL_SECRET_user",
      SMTP_PASS: "SENTINEL_SECRET_pass",
    });

    const json = JSON.stringify(config);
    expect(json).not.toContain("SENTINEL_SECRET_user");
    expect(json).not.toContain("SENTINEL_SECRET_pass");
  });
});
