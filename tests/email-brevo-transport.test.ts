import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail, parseFromAddress } from "../src/lib/email";

describe("parseFromAddress", () => {
  it("parses Name <email@domain> format", () => {
    const result = parseFromAddress("Finlynq <noreply@finlynq.com>");
    expect(result).toEqual({
      name: "Finlynq",
      email: "noreply@finlynq.com",
    });
  });

  it("parses bare email address", () => {
    const result = parseFromAddress("noreply@finlynq.com");
    expect(result).toEqual({
      email: "noreply@finlynq.com",
    });
  });

  it("parses email with spaces in name", () => {
    const result = parseFromAddress("My Company Name <info@example.com>");
    expect(result).toEqual({
      name: "My Company Name",
      email: "info@example.com",
    });
  });

  it("trims whitespace around address", () => {
    const result = parseFromAddress("  noreply@finlynq.com  ");
    expect(result).toEqual({
      email: "noreply@finlynq.com",
    });
  });

  it("trims whitespace in Name <email> format", () => {
    const result = parseFromAddress("  Finlynq  <  noreply@finlynq.com  >  ");
    expect(result).toEqual({
      name: "Finlynq",
      email: "noreply@finlynq.com",
    });
  });

  it("example from task description: Finlynq <noreply2.brevo@reika.co>", () => {
    const result = parseFromAddress("Finlynq <noreply2.brevo@reika.co>");
    expect(result).toEqual({
      name: "Finlynq",
      email: "noreply2.brevo@reika.co",
    });
  });
});

describe("Brevo Email Transport", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset process.env to a clean state for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("sends email via Brevo API when BREVO_API_KEY is set", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      subject: "Test Email",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.method).toBe("POST");
    expect(options.headers["api-key"]).toBe("test-brevo-key");
    expect(options.headers["content-type"]).toBe("application/json");
    expect(options.headers.accept).toBe("application/json");

    const body = JSON.parse(options.body);
    expect(body.to).toEqual([{ email: "user@example.com" }]);
    expect(body.subject).toBe("Test Email");
    expect(body.htmlContent).toBe("<p>Hello</p>");
    expect(body.textContent).toBe("Hello");
    expect(body.sender).toEqual({
      name: "Finlynq",
      email: "noreply@finlynq.com",
    });
  });

  it("sends with custom from address (Name <email> format)", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      from: "Support <support@finlynq.com>",
      subject: "Test",
      html: "<p>Test</p>",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sender).toEqual({
      name: "Support",
      email: "support@finlynq.com",
    });
  });

  it("sends with custom from address (bare email)", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      from: "noreply@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sender).toEqual({
      email: "noreply@example.com",
    });
  });

  it("includes replyTo when provided", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      replyTo: "support@finlynq.com",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.replyTo).toEqual({ email: "support@finlynq.com" });
  });

  it("omits undefined keys from request body", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      // No text, no replyTo
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.textContent).toBeUndefined();
    expect(body.replyTo).toBeUndefined();
  });

  it("rejects with error on non-2xx response", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized: Invalid API key"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      })
    ).rejects.toThrow("Brevo API send failed (401)");
  });

  it("truncates error detail to 300 chars", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const longError = "x".repeat(500);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(longError),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      await sendEmail({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      });
      expect.fail("Should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("Brevo API send failed (400)");
      expect(message.length).toBeLessThan(400); // Some buffer
    }
  });

  it("takes priority over SMTP_HOST when both are set", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = "smtp.example.com";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    // Should use Brevo, not SMTP
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.any(Object)
    );
  });

  it("loses priority to RESEND_API_KEY when both are set", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    process.env.RESEND_API_KEY = "test-resend-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    // Should use Resend, not Brevo
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.any(Object)
    );
  });

  it("uses EMAIL_FROM env var when from is not provided", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = "Custom <custom@example.com>";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sender).toEqual({
      name: "Custom",
      email: "custom@example.com",
    });
  });

  it("falls back to default from address when no env vars", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sender).toEqual({
      name: "Finlynq",
      email: "noreply@finlynq.com",
    });
  });

  it("formats single to address as array with email object", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: "user@example.com" }]);
  });

  it("handles fetch error gracefully", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      })
    ).rejects.toThrow("Network error");
  });

  it("handles text() promise rejection on error response", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.RESEND_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("Could not read response")),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      })
    ).rejects.toThrow("Brevo API send failed (500):");
  });
});
