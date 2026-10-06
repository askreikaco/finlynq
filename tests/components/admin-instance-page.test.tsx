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
  it("renders the 'Instance config' heading", async () => {
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
      expect(screen.getByText("Instance config")).toBeTruthy();
    });
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
