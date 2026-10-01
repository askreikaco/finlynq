/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/rules",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import RulesSettingsPage from "@/app/(app)/settings/rules/page";

const rule = (isActive: boolean) => ({
  id: 7, name: "Match CASHIN", priority: 20, isActive,
  conditions: { all: [] }, actions: [], actionFKNames: {},
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stub(active: boolean) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = url === "/api/rules" && !init ? [rule(active)] : url === "/api/rules" ? { ok: true } : [];
    return { ok: true, status: 200, json: async () => body };
  }));
  return calls;
}

describe("rules list enable/disable", () => {
  it.each([true, false])("renders a switch (active=%s) instead of a Disable/Enable button", async (active) => {
    stub(active);
    render(<RulesSettingsPage />);
    const sw = await screen.findByRole("switch", { name: /rule Match CASHIN/ });
    expect(sw.getAttribute("aria-checked")).toBe(String(active));
    expect(screen.queryByRole("button", { name: /^(Disable|Enable)$/ })).toBeNull();
  });

  it("toggling sends PUT with the flipped isActive", async () => {
    const calls = stub(true);
    render(<RulesSettingsPage />);
    fireEvent.click(await screen.findByRole("switch"));
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === "PUT");
      expect(put && JSON.parse(String(put.init!.body))).toEqual({ id: 7, isActive: false });
    });
  });
});
