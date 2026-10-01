/**
 * @vitest-environment jsdom
 * Folded settings pages: old URL renders the parent in place with the right
 * section open / scrolled into view (no redirect); Clear All Data keeps its 3-step confirm.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

let mockPath = "/settings/rules";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/settings/sections/rules-section", () => ({ RulesSection: () => <div>rules-body</div> }));
vi.mock("@/components/settings/sections/import-section", () => ({
  ImportSettingsCard: () => <div id="import-settings">import-body</div>,
  ImportTemplatesItem: () => null,
  ImportEmailItem: () => null,
  ImportMigrateItem: () => null,
  ImportStatementsItem: () => null,
}));
vi.mock("@/components/settings/sections/bank-feeds-section", () => ({ BankFeedsSection: () => <div>banks-body</div> }));
vi.mock("@/components/portfolio/rebuild-snapshots-button", () => ({ RebuildSnapshotsButton: () => null }));
vi.mock("../../src/app/(app)/settings/integrations/connected-apps", () => ({ ConnectedApps: () => null }));

import RulesPage from "@/app/(app)/settings/rules/page";
import ImportPage from "@/app/(app)/settings/import/page";
import ReconPage from "@/app/(app)/settings/reconciliation/page";
import BankFeedsPage from "@/app/(app)/settings/bank-feeds/page";
import IntegrationsPage from "@/app/(app)/settings/integrations/page";
import DataPage from "@/app/(app)/settings/data/page";
import DeveloperPage from "@/app/(app)/settings/developer/page";

let calls: { url: string; init?: RequestInit }[];
beforeEach(() => {
  calls = [];
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({}) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("old paths render the parent with the section open", () => {
  it("/settings/rules -> Reconciliation scrolled to the Rules card", async () => {
    mockPath = "/settings/rules";
    render(<RulesPage />);
    expect(await screen.findByText("rules-body")).toBeInTheDocument();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toHaveAttribute("id", "rules");
  });
  it("/settings/import -> Reconciliation scrolled to the Import settings card", async () => {
    mockPath = "/settings/import";
    render(<ImportPage />);
    expect(await screen.findByText("import-body")).toBeInTheDocument();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toHaveAttribute("id", "import-settings");
  });
  it("/settings/reconciliation shows Import settings + Rules as cards, no scroll", () => {
    mockPath = "/settings/reconciliation";
    render(<ReconPage />);
    expect(screen.getByText("import-body")).toBeInTheDocument();
    expect(screen.getByText("rules-body")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Rules/ })).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
  it("/settings/bank-feeds -> Integrations, Bank feeds open", async () => {
    mockPath = "/settings/bank-feeds";
    render(<BankFeedsPage />);
    expect(await screen.findByText("banks-body")).toBeInTheDocument();
  });
  it("/settings/integrations keeps Bank feeds collapsed", () => {
    mockPath = "/settings/integrations";
    render(<IntegrationsPage />);
    expect(screen.queryByText("banks-body")).toBeNull();
  });
  it("/settings/data -> Developer, Data open", async () => {
    mockPath = "/settings/data";
    render(<DataPage />);
    expect(await screen.findByRole("button", { name: /Clear All Data/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Data/ })).toHaveAttribute("aria-expanded", "true");
  });
  it("/settings/developer keeps Data collapsed", () => {
    mockPath = "/settings/developer";
    render(<DeveloperPage />);
    expect(screen.getByRole("button", { name: /^Data/ })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Clear All Data keeps its 3-step confirm", () => {
  it("needs two clicks then typing DELETE before DELETE /api/data", async () => {
    mockPath = "/settings/data";
    render(<DataPage />);
    const start = await screen.findByRole("button", { name: /Clear All Data/ });
    fireEvent.click(start);
    expect(calls.some((c) => c.init?.method === "DELETE")).toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: /Yes, I want to delete everything/ }));
    const input = await screen.findByPlaceholderText(/DELETE/);
    fireEvent.change(input, { target: { value: "nope" } });
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(calls.some((c) => c.url === "/api/data" && c.init?.method === "DELETE")).toBe(false);
    fireEvent.change(input, { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/data" && c.init?.method === "DELETE")).toBe(true));
  });
});
