/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

let mockPath = "/dashboard";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPath,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { AppTabs } from "@/components/nav";

const queryBar = () => screen.queryByRole("navigation", { name: "Mobile navigation" });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockPath = "/dashboard";
});

describe("mobile tab bar visibility by route", () => {
  it("renders on /dashboard and /transactions", () => {
    for (const p of ["/dashboard", "/transactions"]) {
      mockPath = p;
      cleanup();
      render(<AppTabs />);
      expect(queryBar(), `bar on ${p}`).not.toBeNull();
    }
  });

  it.each(["/transactions/new", "/accounts/new", "/loans/new", "/loans/7/edit", "/subscriptions/new", "/subscriptions/3/edit", "/accounts/7/edit", "/budgets/new", "/budgets/templates/new", "/budgets/move-money", "/goals/new", "/goals/12/edit"])("is absent on %s (full-screen entry flow)", (p) => {
    mockPath = p;
    render(<AppTabs />);
    expect(queryBar()).toBeNull();
  });

  it.each([
    "/portfolio/new/buy",
    "/portfolio/new/sell",
    "/portfolio/new/swap",
    "/portfolio/new/in-kind-transfer",
    "/portfolio/new/income-expense",
    "/portfolio/new/fx-conversion",
    "/portfolio/new/deposit",
    "/portfolio/new/withdrawal",
  ])("is absent on %s (operation form, full-screen)", (p) => {
    mockPath = p;
    render(<AppTabs />);
    expect(queryBar(), `bar on ${p}`).toBeNull();
  });

  it("is present on /portfolio/new (operation list keeps the tab bar)", () => {
    mockPath = "/portfolio/new";
    render(<AppTabs />);
    expect(queryBar()).not.toBeNull();
  });

  it.each([
    "/dashboard",
    "/accounts",
    "/portfolio",
    "/transactions",
    "/more",
    "/transactions/search",
  ])("is present on %s (not hidden)", (p) => {
    mockPath = p;
    render(<AppTabs />);
    expect(queryBar(), `bar on ${p}`).not.toBeNull();
  });

  it.each(["/transactions/new", "/loans/7/edit", "/portfolio/new/buy", "/dashboard"])(
    "the rail stays on %s (it sits left of the content, so it never overlaps a form)",
    (p) => {
      mockPath = p;
      render(<AppTabs />);
      expect(screen.getByRole("navigation", { name: "Main navigation" })).not.toBeNull();
    },
  );
});
