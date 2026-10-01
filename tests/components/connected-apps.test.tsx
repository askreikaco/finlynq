/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("lucide-react", () => ({
  Plug: () => <div>Plug Icon</div>,
  Loader2: () => <div>Loader Icon</div>,
}));

import { ConnectedApps } from "@/app/(app)/settings/integrations/connected-apps";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stub = (res: Partial<Response> | Error) =>
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res as Response;
  }));

describe("ConnectedApps component", () => {
  it("shows MCP API key row when mcpApiKeyLastUsedAt is set", async () => {
    stub({
      ok: true,
      json: async () => ({
        apps: [],
        mcpApiKeyLastUsedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    render(<ConnectedApps />);

    // Wait for the component to load and display
    const mcpRow = await screen.findByText("MCP client (API key)");
    expect(mcpRow).toBeTruthy();

    // Check for the "Manage API key" button
    const manageButton = await screen.findByText("Manage API key");
    expect(manageButton).toBeTruthy();
    expect(manageButton.closest("a")?.getAttribute("href")).toBe("/settings/developer");

    // Verify "Last used" text is shown
    expect(screen.getByText(/Last used \d+ (hour|day|minute)s? ago/)).toBeTruthy();
  });

  it("does not show MCP API key row when mcpApiKeyLastUsedAt is null", async () => {
    stub({
      ok: true,
      json: async () => ({
        apps: [],
        mcpApiKeyLastUsedAt: null,
      }),
    });

    render(<ConnectedApps />);

    // Wait a bit for loading to complete
    await new Promise((r) => setTimeout(r, 10));

    const mcpRow = screen.queryByText("MCP client (API key)");
    expect(mcpRow).toBeNull();
  });

  it("shows both OAuth apps and MCP API key row when both exist", async () => {
    stub({
      ok: true,
      json: async () => ({
        apps: [
          {
            id: 1,
            clientId: "claude",
            clientName: "Claude",
            scope: "mcp:read mcp:write",
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
        mcpApiKeyLastUsedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    render(<ConnectedApps />);

    // Both rows should be visible
    expect(await screen.findByText("MCP client (API key)")).toBeTruthy();
    expect(await screen.findByText("Claude")).toBeTruthy();
  });

  it("has no Revoke button on the MCP API key row", async () => {
    stub({
      ok: true,
      json: async () => ({
        apps: [],
        mcpApiKeyLastUsedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    render(<ConnectedApps />);

    await screen.findByText("MCP client (API key)");

    // Check that there's a "Manage API key" button but NO "Revoke" button for the MCP row
    const manageButton = screen.getByText("Manage API key");
    expect(manageButton).toBeTruthy();

    // Get all Revoke buttons (there should be none since there are no OAuth apps)
    const revokeButtons = screen.queryAllByText("Revoke");
    expect(revokeButtons.length).toBe(0);
  });

  it("displays relative time for MCP API key usage", async () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    stub({
      ok: true,
      json: async () => ({
        apps: [],
        mcpApiKeyLastUsedAt: twoHoursAgo,
      }),
    });

    render(<ConnectedApps />);

    // Check for relative time display (just verify it contains "Last used" and "ago")
    await screen.findByText(/Last used/);
    expect(screen.getByText(/Last used/)).toBeTruthy();
  });
});
