/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

vi.mock("@/app/(app)/settings/integrations/connected-apps", () => ({
  ConnectedApps: () => null,
}));

import IntegrationsSettingsPage from "@/app/(app)/settings/integrations/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const stub = (res: Partial<Response> | Error) =>
  vi.stubGlobal("fetch", vi.fn(async () => { if (res instanceof Error) throw res; return res as Response; }));

describe("Integrations MCP guide card", () => {
  it("shows when no app is connected and no API key has been used", async () => {
    stub({ ok: true, json: async () => ({ apps: [], mcpApiKeyLastUsedAt: null }) });
    render(<IntegrationsSettingsPage />);
    expect(await screen.findByText("View MCP Guide")).toBeTruthy();
  });

  it("hides when an OAuth app is connected", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ apps: [{ id: 1 }], mcpApiKeyLastUsedAt: null }) }) as Response);
    vi.stubGlobal("fetch", f);
    render(<IntegrationsSettingsPage />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("View MCP Guide")).toBeNull();
  });

  it("hides when API key has been used in the last 30 days", async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    stub({ ok: true, json: async () => ({ apps: [], mcpApiKeyLastUsedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }) });
    render(<IntegrationsSettingsPage />);
    await waitFor(() => expect(screen.queryByText("View MCP Guide")).toBeNull());
  });

  it("shows 'Show setup guide' link when connected and guide is hidden", async () => {
    stub({ ok: true, json: async () => ({ apps: [{ id: 1 }], mcpApiKeyLastUsedAt: null }) });
    render(<IntegrationsSettingsPage />);
    await waitFor(() => expect(screen.findByText("Show setup guide")).toBeTruthy());
  });

  it("does not show on a failed fetch (non-OK or network error)", async () => {
    stub({ ok: false, json: async () => ({}) });
    const { unmount } = render(<IntegrationsSettingsPage />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("View MCP Guide")).toBeNull();
    unmount();
    stub(new Error("net"));
    render(<IntegrationsSettingsPage />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("View MCP Guide")).toBeNull();
  });
});
