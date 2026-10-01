import { describe, it, expect } from "vitest";
import { safeNext, googleErrorMessage, GOOGLE_ERRORS } from "@/lib/auth/google-ui";

describe("safeNext", () => {
  it("returns fallback for null", () => {
    expect(safeNext(null)).toBe("/dashboard");
  });

  it("returns fallback for undefined", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
  });

  it("returns fallback for empty string", () => {
    expect(safeNext("")).toBe("/dashboard");
  });

  it("rejects URLs starting with //", () => {
    expect(safeNext("//evil.com")).toBe("/dashboard");
  });

  it("rejects URLs with scheme", () => {
    expect(safeNext("https://evil.com")).toBe("/dashboard");
  });

  it("rejects URLs with backslash", () => {
    expect(safeNext("/a\\b")).toBe("/dashboard");
  });

  it("rejects control characters browsers strip from URLs (tab/CR/LF)", () => {
    expect(safeNext("/\t/evil.com")).toBe("/dashboard");
    expect(safeNext("/\n/evil.com")).toBe("/dashboard");
    expect(safeNext("/\r/evil.com")).toBe("/dashboard");
  });

  it("rejects absolute and scheme URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });

  it("accepts valid paths", () => {
    expect(safeNext("/budgets")).toBe("/budgets");
  });

  it("accepts paths with query params", () => {
    expect(safeNext("/budgets?filter=all")).toBe("/budgets?filter=all");
  });

  it("accepts nested paths", () => {
    expect(safeNext("/reports/monthly")).toBe("/reports/monthly");
  });

  it("respects custom fallback", () => {
    expect(safeNext(null, "/login")).toBe("/login");
    expect(safeNext("//evil.com", "/login")).toBe("/login");
  });
});

describe("googleErrorMessage", () => {
  // All error codes from callback route
  const allCodes = [
    "google_denied",
    "google_server_error",
    "google_missing_params",
    "google_no_state",
    "google_invalid_state",
    "google_state_mismatch",
    "google_exchange_failed",
    "google_token_invalid",
    "google_user_not_found",
    "google_rate_limit",
    "google_link_session",
    "google_already_linked",
  ];

  it("has error message for every code from callback", () => {
    for (const code of allCodes) {
      const msg = googleErrorMessage(code);
      expect(msg).toBeTruthy();
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("has en and vi translations for every code", () => {
    for (const code of allCodes) {
      expect(GOOGLE_ERRORS[code]).toBeDefined();
      expect(GOOGLE_ERRORS[code].en).toBeTruthy();
      expect(GOOGLE_ERRORS[code].vi).toBeTruthy();
    }
  });

  it("falls back to server_error for unknown codes", () => {
    const msg = googleErrorMessage("google_unknown");
    const fallback = GOOGLE_ERRORS.google_server_error.en;
    expect(msg).toBe(fallback);
  });

  it("returns non-generic messages for known codes", () => {
    const serverError = GOOGLE_ERRORS.google_server_error.en;
    const specificCodes = ["google_denied", "google_user_not_found", "google_already_linked"];
    for (const code of specificCodes) {
      const msg = googleErrorMessage(code);
      expect(msg).not.toBe(serverError);
    }
  });
});
