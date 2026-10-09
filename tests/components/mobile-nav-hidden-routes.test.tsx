/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

let mockPath = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { Nav } from "@/components/nav";

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
      render(<Nav />);
      expect(queryBar(), `bar on ${p}`).not.toBeNull();
    }
  });

  it.each(["/transactions/new", "/accounts/new"])("is absent on %s (full-screen entry flow)", (p) => {
    mockPath = p;
    render(<Nav />);
    expect(queryBar()).toBeNull();
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
    render(<Nav />);
    expect(queryBar(), `bar on ${p}`).not.toBeNull();
  });
});
