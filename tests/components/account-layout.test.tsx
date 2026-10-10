/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

let mockPath = "/account/info";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
}));

import { AccountShell } from "@/components/account-shell";

beforeEach(() => {
  mockPath = "/account/info";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountShell (FINLYNQ_NAV_V2 retired)", () => {
  describe("Hub page (/account)", () => {
    it("hides tab navigation on hub page", () => {
      mockPath = "/account";
      render(
        <AccountShell>
          <div>Hub content</div>
        </AccountShell>
      );

      const tabs = screen.queryAllByRole("tab");
      expect(tabs.length).toBe(0);
    });

    it("still renders heading and children on hub page", () => {
      mockPath = "/account";
      render(
        <AccountShell>
          <div>Hub content</div>
        </AccountShell>
      );

      expect(screen.getByText("Account")).toBeTruthy();
      expect(screen.getByText("Profile, login, API key, privacy, and backup / restore")).toBeTruthy();
      expect(screen.getByText("Hub content")).toBeTruthy();
    });

    it("never links the hub back to itself (its registry parent is More)", () => {
      mockPath = "/account";
      render(
        <AccountShell>
          <div>Hub content</div>
        </AccountShell>
      );

      const backLinks = screen.queryAllByRole("link", { name: /^back/i });
      for (const link of backLinks) {
        expect(link.getAttribute("href")).not.toBe("/account");
      }
    });
  });

  describe("Sub-pages with tabs", () => {
    it("renders heading and account tabs in correct order on /account/info", () => {
      mockPath = "/account/info";
      render(
        <AccountShell>
          <div>Test content</div>
        </AccountShell>
      );

      expect(screen.getByText("Account")).toBeTruthy();
      expect(screen.getByText("Profile, login, API key, privacy, and backup / restore")).toBeTruthy();

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);
      expect(tabs[0].textContent).toContain("Info");
      expect(tabs[1].textContent).toContain("Security");
    });

    it("sets aria-selected=true on active tab (Info)", () => {
      mockPath = "/account/info";
      render(
        <AccountShell>
          <div>Test content</div>
        </AccountShell>
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");
      expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    });

    it("sets aria-selected=true on active tab (Security)", () => {
      mockPath = "/account/security";
      render(
        <AccountShell>
          <div>Test content</div>
        </AccountShell>
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);
      expect(tabs[0].getAttribute("aria-selected")).toBe("false");
      expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    });

    it("renders children on sub-pages", () => {
      mockPath = "/account/info";
      render(
        <AccountShell>
          <div>Test content goes here</div>
        </AccountShell>
      );

      expect(screen.getByText("Test content goes here")).toBeTruthy();
    });

    it("always shows the back link on a sub-page, with no flag to turn it on", () => {
      mockPath = "/account/info";
      render(
        <AccountShell>
          <div>Test content</div>
        </AccountShell>
      );

      const backButton = screen.getByRole("link", { name: /account/i });
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("href")).toBe("/account");
      expect(backButton.getAttribute("data-slot")).toBe("back-button");
    });

    it("shows tabs and back link on nested path /account/security", () => {
      mockPath = "/account/security";
      render(
        <AccountShell>
          <div>Security content</div>
        </AccountShell>
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);
      expect(tabs[0].getAttribute("aria-selected")).toBe("false");
      expect(tabs[1].getAttribute("aria-selected")).toBe("true");

      const backButton = screen.getByRole("link", { name: /account/i });
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("href")).toBe("/account");
      expect(backButton.getAttribute("data-slot")).toBe("back-button");
    });

    it("tab touch targets follow pointer type, not viewport width", () => {
      mockPath = "/account/info";
      render(
        <AccountShell>
          <div>Test content</div>
        </AccountShell>
      );

      const tab = screen.getAllByRole("tab")[0];
      expect(tab.className).toContain("pointer-coarse:min-h-11");
      expect(tab.className).not.toMatch(/max-md:/);
    });
  });
});
