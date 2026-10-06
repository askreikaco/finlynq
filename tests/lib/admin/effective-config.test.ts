import { describe, it, expect } from "vitest";
import { getEffectiveConfig } from "@/lib/admin/effective-config";

describe("getEffectiveConfig", () => {
  it("returns defaults when env is empty", () => {
    const config = getEffectiveConfig({});

    expect(config.google.clientId.value).toBeNull();
    expect(config.google.clientSecret.value).toBeNull();
    expect(config.google.enabled.value).toBe(false);
    expect(config.passkey.enabled.value).toBe(true);
    expect(config.registration.allowOpen.value).toBe(true);
    expect(config.email.enabled.value).toBe(false);
    expect(config.captcha.enabled.value).toBe(false);
  });

  it("reads GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from env", () => {
    const config = getEffectiveConfig({
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
    });

    expect(config.google.clientId.value).toBe("test-client-id");
    expect(config.google.clientSecret.value).toBeNull(); // Secret value is never returned
    expect(config.google.clientSecret.masked).toBe(true);
    expect(config.google.enabled.value).toBe(true);
  });

  it("enables Google only when both clientId and clientSecret are set", () => {
    const configIdOnly = getEffectiveConfig({
      GOOGLE_CLIENT_ID: "test-id",
    });
    expect(configIdOnly.google.enabled.value).toBe(false);

    const configSecretOnly = getEffectiveConfig({
      GOOGLE_CLIENT_SECRET: "test-secret",
    });
    expect(configSecretOnly.google.enabled.value).toBe(false);

    const configBoth = getEffectiveConfig({
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
    });
    expect(configBoth.google.enabled.value).toBe(true);
  });

  it("reads SENDGRID_API_KEY for email enabled status", () => {
    const configNoEmail = getEffectiveConfig({});
    expect(configNoEmail.email.enabled.value).toBe(false);

    const configWithEmail = getEffectiveConfig({
      SENDGRID_API_KEY: "SG.test-key",
    });
    expect(configWithEmail.email.enabled.value).toBe(true);
  });

  it("masks secrets in displayValue and never leaks value", () => {
    const config = getEffectiveConfig({
      GOOGLE_CLIENT_SECRET: "super-secret-key-12345",
    });

    expect(config.google.clientSecret.value).toBeNull(); // Secret value is never returned
    expect(config.google.clientSecret.masked).toBe(true);
    expect(config.google.clientSecret.displayValue).toBe("***");
  });

  it("does not mask client IDs", () => {
    const config = getEffectiveConfig({
      GOOGLE_CLIENT_ID: "123456.apps.googleusercontent.com",
    });

    expect(config.google.clientId.masked).toBe(false);
    expect(config.google.clientId.displayValue).toContain("123456");
  });

  it("truncates long client IDs for display", () => {
    const config = getEffectiveConfig({
      GOOGLE_CLIENT_ID: "123456789012345678901234567890",
    });

    expect(config.google.clientId.displayValue).toBe("1234567890...");
  });

  it("shows empty display value when secret is empty", () => {
    const config = getEffectiveConfig({});

    expect(config.google.clientSecret.value).toBeNull();
    expect(config.google.clientSecret.displayValue).toBe("(empty)");
  });

  it("sets correct source for all fields", () => {
    const config = getEffectiveConfig({
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
      SENDGRID_API_KEY: "test-key",
    });

    expect(config.google.clientId.source).toBe("env");
    expect(config.google.clientSecret.source).toBe("env");
    expect(config.google.enabled.source).toBe("env");
    expect(config.passkey.enabled.source).toBe("default");
    expect(config.registration.allowOpen.source).toBe("default");
    expect(config.email.enabled.source).toBe("env");
    expect(config.captcha.enabled.source).toBe("default");
  });

  it("never leaks secrets in the whole config object", () => {
    const config = getEffectiveConfig({
      GOOGLE_CLIENT_SECRET: "super-secret-should-not-leak",
      SENDGRID_API_KEY: "sg-secret-should-not-leak",
    });

    // Serialize to JSON and verify no secrets appear
    const json = JSON.stringify(config);
    expect(json).not.toContain("super-secret-should-not-leak");
    expect(json).not.toContain("sg-secret-should-not-leak");
    // Only "***" should appear for masked secrets
    expect(json).toContain("***");
  });
});
