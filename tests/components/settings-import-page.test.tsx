/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/import",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/(app)/import/components/template-manager", () => ({ TemplateManager: () => <div>templates-body</div> }));
vi.mock("@/app/(app)/import/components/connector-tab", () => ({ ConnectorTab: () => <div>wp-body</div> }));
vi.mock("@/app/(app)/import/components/moneypro-connector-tab", () => ({ MoneyProConnectorTab: () => <div>mp-body</div> }));
vi.mock("@/app/(app)/import/components/generic-csv-connector-tab", () => ({ GenericCsvConnectorTab: () => <div>csv-body</div> }));
vi.mock("@/app/(app)/import/components/investment-statement-importer", () => ({ InvestmentStatementImporter: () => <div>statements-body</div> }));
vi.mock("@/components/inbox/email-rules-manager", () => ({ EmailRulesManager: () => <div>rules-body</div> }));

import ImportSettingsPage from "@/app/(app)/settings/import/page";

let calls: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  calls = [];
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

describe("settings/import accordion", () => {
  it("renders no tablist; /settings/import opens Import settings, the flattened sections start collapsed", async () => {
    render(<ImportSettingsPage />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(section(/Import settings/).getAttribute("aria-expanded")).toBe("true");
    for (const n of [/Rules/, /Templates/, /Email Import/, /Migrate from another app/, /Investment statements/]) {
      expect(section(n).getAttribute("aria-expanded")).toBe("false");
    }
    expect(screen.queryByText("templates-body")).toBeNull();
  });

  it("opening one section closes the other", async () => {
    render(<ImportSettingsPage />);
    fireEvent.click(section(/Templates/));
    expect(await screen.findByText("templates-body")).toBeTruthy();
    fireEvent.click(section(/Investment statements/));
    expect(await screen.findByText("statements-body")).toBeTruthy();
    expect(section(/Templates/).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("templates-body")).toBeNull();
  });

  it.each([
    ["?tab=email", /Email Import/],
    ["?tab=connect", /Migrate from another app/],
    ["?tab=statements", /Investment statements/],
    ["?provider=moneypro", /Migrate from another app/],
    ["#templates", /Templates/],
  ])("deep link %s opens the right section", async (suffix, name) => {
    window.history.replaceState({}, "", "/settings/import" + suffix);
    render(<ImportSettingsPage />);
    await waitFor(() => expect(section(name).getAttribute("aria-expanded")).toBe("true"));
  });

  it("?provider=moneypro shows that provider's flow", async () => {
    window.history.replaceState({}, "", "/settings/import?provider=moneypro");
    render(<ImportSettingsPage />);
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
