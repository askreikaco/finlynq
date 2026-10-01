/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let mockPath = "/settings/import";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/settings/sections/rules-section", () => ({ RulesSection: () => <div>tx-rules-body</div> }));
vi.mock("@/components/settings/sections/bank-feeds-section", () => ({ BankFeedsSection: () => null }));
vi.mock("@/components/mcp-guide/mcp-guide", () => ({ McpGuide: () => null }));
vi.mock("../../src/app/(app)/settings/integrations/connected-apps", () => ({ ConnectedApps: () => null }));
vi.mock("@/app/(app)/import/components/template-manager", () => ({ TemplateManager: () => <div>templates-body</div> }));
vi.mock("@/app/(app)/import/components/connector-tab", () => ({ ConnectorTab: () => <div>wp-body</div> }));
vi.mock("@/app/(app)/import/components/moneypro-connector-tab", () => ({ MoneyProConnectorTab: () => <div>mp-body</div> }));
vi.mock("@/app/(app)/import/components/generic-csv-connector-tab", () => ({ GenericCsvConnectorTab: () => <div>csv-body</div> }));
vi.mock("@/app/(app)/import/components/investment-statement-importer", () => ({ InvestmentStatementImporter: () => <div>statements-body</div> }));
vi.mock("@/components/inbox/email-rules-manager", () => ({ EmailRulesManager: () => <div>rules-body</div> }));

import ImportSettingsPage from "@/app/(app)/settings/import/page";
import IntegrationsPage from "@/app/(app)/settings/integrations/page";

let calls: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  calls = [];
  mockPath = "/settings/import";
  replace.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body =
      url === "/api/settings/confirm-csv-mapping" ? { confirmCsvMapping: init?.method === "PUT" ? JSON.parse(String(init.body)).confirmCsvMapping : true }
      : url === "/api/import/email-config" ? { email: "x@import.test" }
      : url === "/api/accounts" || url === "/api/import/templates" ? []
      : {};
    return { ok: true, status: 200, json: async () => body };
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/settings/import");
});

const section = (n: RegExp) => screen.getByRole("button", { name: n });

describe("settings/import (Reconciliation) and the Import sections on Integrations", () => {
  it("Import settings and Rules are cards; Import Templates is the only accordion item", async () => {
    render(<ImportSettingsPage />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(await screen.findByRole("switch", { name: /Confirm field mapping/ })).toBeTruthy();
    expect(screen.getByText("tx-rules-body")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Import settings/ })).toBeNull();
    expect(section(/Import Templates/).getAttribute("aria-expanded")).toBe("false");
    for (const n of [/Import via Email/, /Import via another app/, /Import Investment Statement/]) {
      expect(screen.queryByRole("button", { name: n })).toBeNull();
    }
    fireEvent.click(section(/Import Templates/));
    expect(await screen.findByText("templates-body")).toBeTruthy();
  });

  it("#templates opens Import Templates", async () => {
    window.history.replaceState({}, "", "/settings/import#templates");
    render(<ImportSettingsPage />);
    await waitFor(() => expect(section(/Import Templates/).getAttribute("aria-expanded")).toBe("true"));
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["?tab=email", "/settings/integrations?tab=email"],
    ["?tab=connect", "/settings/integrations?tab=migrate"],
    ["?tab=statements", "/settings/integrations?tab=statements"],
    ["?provider=moneypro", "/settings/integrations?tab=migrate&provider=moneypro"],
  ])("legacy /settings/import%s forwards to %s", async (suffix, href) => {
    window.history.replaceState({}, "", "/settings/import" + suffix);
    render(<ImportSettingsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(href));
  });

  it("Integrations: the moved sections start collapsed; opening one closes the other", async () => {
    mockPath = "/settings/integrations";
    window.history.replaceState({}, "", "/settings/integrations");
    render(<IntegrationsPage />);
    for (const n of [/Import via Email/, /Import via another app/, /Import Investment Statement/]) {
      expect(section(n).getAttribute("aria-expanded")).toBe("false");
    }
    fireEvent.click(section(/Import via Email/));
    expect(await screen.findByText("x@import.test")).toBeTruthy();
    fireEvent.click(section(/Import Investment Statement/));
    expect(await screen.findByText("statements-body")).toBeTruthy();
    expect(section(/Import via Email/).getAttribute("aria-expanded")).toBe("false");
  });

  it.each([
    ["?tab=email", /Import via Email/],
    ["?tab=migrate", /Import via another app/],
    ["?tab=statements", /Import Investment Statement/],
    ["?provider=moneypro", /Import via another app/],
  ])("Integrations deep link %s opens the right section", async (suffix, name) => {
    mockPath = "/settings/integrations";
    window.history.replaceState({}, "", "/settings/integrations" + suffix);
    render(<IntegrationsPage />);
    await waitFor(() => expect(section(name).getAttribute("aria-expanded")).toBe("true"));
  });

  it("?provider=moneypro shows that provider's flow", async () => {
    mockPath = "/settings/integrations";
    window.history.replaceState({}, "", "/settings/integrations?provider=moneypro");
    render(<IntegrationsPage />);
    expect(await screen.findByText("mp-body")).toBeTruthy();
  });

  it("confirm-mapping uses a switch (no Disable/Enable button) and PUTs the flipped value", async () => {
    render(<ImportSettingsPage />);
    expect(screen.queryByRole("button", { name: /^(Disable|Enable)$/ })).toBeNull();
    const sw = await screen.findByRole("switch", { name: /Confirm field mapping/ });
    expect(screen.getByText("Confirmation is ON")).toBeTruthy();
    fireEvent.click(sw);
    await waitFor(() => {
      const put = calls.find((c) => c.url === "/api/settings/confirm-csv-mapping" && c.init?.method === "PUT");
      expect(put && JSON.parse(String(put.init!.body))).toEqual({ confirmCsvMapping: false });
    });
    expect(await screen.findByText("Confirmation is OFF")).toBeTruthy();
  });
});
