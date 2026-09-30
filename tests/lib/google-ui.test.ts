/**
 * Tests for google-ui.ts
 * - Email masking function
 * - String constants exist and are accessible
 */

import { describe, it, expect } from "vitest";
import { maskEmail, googleUIStrings } from "@/lib/ui/google-ui";

describe("maskEmail", () => {
  it("masks single-character local part", () => {
    const masked = maskEmail("a@example.com");
    expect(masked).toBe("a*@example.com");
  });

  it("masks two-character local part", () => {
    const masked = maskEmail("ab@example.com");
    expect(masked).toBe("a*@example.com");
  });

  it("masks longer local parts", () => {
    const masked = maskEmail("user@example.com");
    expect(masked).toMatch(/^u\*+@example\.com$/);
    expect(masked).toBe("u***@example.com");
  });

  it("masks alice@domain.co.uk", () => {
    const masked = maskEmail("alice@domain.co.uk");
    expect(masked).toBe("a****@domain.co.uk");
  });

  it("preserves domain exactly", () => {
    const masked = maskEmail("test@very.long.domain.name");
    expect(masked).toContain("@very.long.domain.name");
  });

  it("handles invalid email gracefully", () => {
    const masked = maskEmail("invalid-email");
    expect(masked).toBe("invalid-email");
  });

  it("handles empty local part", () => {
    const masked = maskEmail("@example.com");
    expect(masked).toBe("@example.com");
  });
});

describe("googleUIStrings", () => {
  it("has signup strings", () => {
    expect(googleUIStrings.signupHeading).toBe("Sign up with Google");
    expect(googleUIStrings.signupDescription).toBeTruthy();
  });

  it("has unlock strings", () => {
    expect(googleUIStrings.unlockHeading).toBe("Unlock your account");
    expect(googleUIStrings.unlockWrongPassword).toBeTruthy();
  });

  it("unlockPrompt function generates masked email", () => {
    const prompt = googleUIStrings.unlockPrompt("user@example.com");
    expect(prompt).toContain("u***@example.com");
    expect(prompt).toContain("Password");
  });

  it("has Google linking strings", () => {
    expect(googleUIStrings.googleLinkingHeading).toBe("Google Account");
    expect(googleUIStrings.googleNotLinked).toBeTruthy();
  });

  it("googleLinked function shows email", () => {
    const text = googleUIStrings.googleLinked("user@example.com");
    expect(text).toContain("user@example.com");
  });

  it("has devices strings", () => {
    expect(googleUIStrings.devicesHeading).toBe("Trusted Devices");
    expect(googleUIStrings.noDevices).toBeTruthy();
  });

  it("has Google button and error strings", () => {
    expect(googleUIStrings.googleButtonLabel).toBe("Continue with Google");
    expect(googleUIStrings.googleSigninError).toBeTruthy();
  });
});
