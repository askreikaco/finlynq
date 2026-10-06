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

  it("displays each distinct row with its displayValue in the correct section", async () => {
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

    // Verify each displayValue is rendered
    expect(screen.getByText("cid-d")).toBeTruthy();
    expect(screen.getByText("gen-d")).toBeTruthy();
    expect(screen.getByText("pk-d")).toBeTruthy();
    expect(screen.getByText("reg-d")).toBeTruthy();
    expect(screen.getByText("em-d")).toBeTruthy();
    expect(screen.getByText("cap-d")).toBeTruthy();

    // Verify no raw values are in the DOM
    const pageHTML = document.body.innerHTML;
    expect(pageHTML).not.toContain("RAW-clientId");
    expect(pageHTML).not.toContain("RAW-secret");
    expect(pageHTML).not.toContain("RAW-enabled");
    expect(pageHTML).not.toContain("RAW-passkey");
    expect(pageHTML).not.toContain("RAW-registration");
    expect(pageHTML).not.toContain("RAW-email");
    expect(pageHTML).not.toContain("RAW-captcha");
  });

  it("displays source badges with correct text: Environment, Database, Default", async () => {
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

    // Verify source badge texts are rendered
    expect(screen.getAllByText("Environment").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Database").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
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
