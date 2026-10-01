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
  it("shows when no app is connected", async () => {
    stub({ ok: true, json: async () => ({ apps: [] }) });
    render(<IntegrationsSettingsPage />);
    expect(await screen.findByText("View MCP Guide")).toBeTruthy();
  });

  it("hides when an app is connected", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ apps: [{ id: 1 }] }) }) as Response);
    vi.stubGlobal("fetch", f);
    render(<IntegrationsSettingsPage />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("View MCP Guide")).toBeNull();
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
