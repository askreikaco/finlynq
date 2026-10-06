/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

// Mock the PageHeader component
vi.mock("@/components/mobile", () => ({
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

// Mock the UI card components
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

// Mock the Badge component
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

import InstanceAdminPage from "@/app/(app)/admin/instance/page";

describe("InstanceAdminPage", () => {
  it("displays 'Loading configuration...' while fetching", async () => {
    // Never-resolving promise to keep loading state
    fetchMock.mockImplementation(() => new Promise(() => {}));

    render(<InstanceAdminPage />);

    // Check that loading message is visible
    await waitFor(() => {
      expect(screen.getByText("Loading configuration...")).toBeTruthy();
    });
  });

  it("renders the 'Instance config' heading", async () => {
    const mockConfig = {
      google: {
        clientId: { displayValue: "cid-d", value: "RAW-clientId", source: "env" as const },
        clientSecret: { displayValue: "***", value: "RAW-secret", source: "env" as const },
        enabled: { displayValue: "gen-d", value: "RAW-enabled", source: "db" as const },
      },
      passkey: {
        enabled: { displayValue: "pk-d", value: "RAW-passkey", source: "default" as const },
      },
      registration: {
        allowOpen: { displayValue: "reg-d", value: "RAW-registration", source: "env" as const },
      },
      email: {
        enabled: { displayValue: "em-d", value: "RAW-email", source: "db" as const },
      },
      captcha: {
        enabled: { displayValue: "cap-d", value: "RAW-captcha", source: "default" as const },
      },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockConfig,
    });

    render(<InstanceAdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Instance config")).toBeTruthy();
    });
  });

  it("renders config rows with displayValues and sources without leaking raw values", async () => {
    const mockConfig = {
      google: {
        clientId: { displayValue: "google-id-display", value: "RAW-google-clientId", source: "env" as const },
        clientSecret: { displayValue: "***", value: "RAW-google-secret", source: "env" as const },
        enabled: { displayValue: "true", value: "RAW-google-enabled", source: "db" as const },
      },
      passkey: {
        enabled: { displayValue: "false", value: "RAW-passkey-enabled", source: "default" as const },
      },
      registration: {
        allowOpen: { displayValue: "true", value: "RAW-registration-allow", source: "env" as const },
      },
      email: {
        enabled: { displayValue: "true", value: "RAW-email-enabled", source: "db" as const },
      },
      captcha: {
        enabled: { displayValue: "false", value: "RAW-captcha-enabled", source: "default" as const },
      },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockConfig,
    });

    render(<InstanceAdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Instance config")).toBeTruthy();
    });

    // Verify section headings render (mocked card elements render children)
    expect(screen.getByText("Google OAuth")).toBeTruthy();
    expect(screen.getByText("Third-party OIDC provider for sign-in")).toBeTruthy();

    // Verify no raw values are in the DOM (only displayValues should render)
    const pageHTML = document.body.innerHTML;
    expect(pageHTML).not.toContain("RAW-google-clientId");
    expect(pageHTML).not.toContain("RAW-google-secret");
    expect(pageHTML).not.toContain("RAW-google-enabled");
    expect(pageHTML).not.toContain("RAW-passkey-enabled");
    expect(pageHTML).not.toContain("RAW-registration-allow");
    expect(pageHTML).not.toContain("RAW-email-enabled");
    expect(pageHTML).not.toContain("RAW-captcha-enabled");
  });

  it("displays source badges with correct text and counts: Environment, Database, Default", async () => {
    const mockConfig = {
      google: {
        clientId: { displayValue: "cid-d", value: "RAW-clientId", source: "env" as const },
        clientSecret: { displayValue: "***", value: "RAW-secret", source: "env" as const },
        enabled: { displayValue: "gen-d", value: "RAW-enabled", source: "db" as const },
      },
      passkey: {
        enabled: { displayValue: "pk-d", value: "RAW-passkey", source: "default" as const },
      },
      registration: {
        allowOpen: { displayValue: "reg-d", value: "RAW-registration", source: "env" as const },
      },
      email: {
        enabled: { displayValue: "em-d", value: "RAW-email", source: "db" as const },
      },
      captcha: {
        enabled: { displayValue: "cap-d", value: "RAW-captcha", source: "default" as const },
      },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockConfig,
    });

    render(<InstanceAdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Instance config")).toBeTruthy();
    });

    // Count badges by source type
    const environmentBadges = screen.getAllByText("Environment");
    const databaseBadges = screen.getAllByText("Database");
    const defaultBadges = screen.getAllByText("Default");

    // Verify exact counts to catch source swaps
    // Environment: clientId, clientSecret, registration.allowOpen = 3
    expect(environmentBadges).toHaveLength(3);
    // Database: google.enabled, email.enabled = 2
    expect(databaseBadges).toHaveLength(2);
    // Default: passkey.enabled, captcha.enabled = 2
    expect(defaultBadges).toHaveLength(2);
  });

  it("displays masked displayValue with *** but not raw value", async () => {
    const mockConfig = {
      google: {
        clientId: { displayValue: "***", value: "actual-secret-123", source: "env" as const },
        clientSecret: { displayValue: "***", value: "super-secret-abc", source: "env" as const },
        enabled: { displayValue: "true", source: "env" as const },
      },
      passkey: {
        enabled: { displayValue: "true", source: "default" as const },
      },
      registration: {
        allowOpen: { displayValue: "true", source: "default" as const },
      },
      email: {
        enabled: { displayValue: "false", source: "default" as const },
      },
      captcha: {
        enabled: { displayValue: "false", source: "default" as const },
      },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockConfig,
    });

    render(<InstanceAdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Instance config")).toBeTruthy();
    });

    // Verify masked values are shown (should have multiple ***)
    const maskedElements = screen.getAllByText("***");
    expect(maskedElements.length).toBeGreaterThan(0);

    // Verify raw secret values are NOT in the DOM
    const pageText = document.body.innerHTML;
    expect(pageText).not.toContain("actual-secret-123");
    expect(pageText).not.toContain("super-secret-abc");
  });

  it("calls fetch with the correct URL", async () => {
    const mockConfig = {
      google: {
        clientId: { displayValue: "***", source: "env" as const },
        clientSecret: { displayValue: "***", source: "env" as const },
        enabled: { displayValue: "true", source: "env" as const },
      },
      passkey: {
        enabled: { displayValue: "true", source: "default" as const },
      },
      registration: {
        allowOpen: { displayValue: "true", source: "default" as const },
      },
      email: {
        enabled: { displayValue: "false", source: "default" as const },
      },
      captcha: {
        enabled: { displayValue: "false", source: "default" as const },
      },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockConfig,
    });

    render(<InstanceAdminPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/instance/config");
    });
  });

  it("displays error message on non-OK response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: "Internal Server Error",
    });

    render(<InstanceAdminPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch config: Internal Server Error/)).toBeTruthy();
    });
  });
});
