/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

let mockIsNavV2Enabled = false;
vi.mock("@/lib/nav-v2/flag", () => ({
  isNavV2Enabled: () => mockIsNavV2Enabled,
}));

let mockPath = "/account";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
}));

import AccountLayout from "@/app/(app)/account/layout";
import { AccountShell } from "@/components/account-shell";

beforeEach(() => {
  mockIsNavV2Enabled = false;
  mockPath = "/account";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountLayout wiring", () => {
  it("passes navV2 prop as true when flag is enabled", () => {
    mockIsNavV2Enabled = true;
    const el = AccountLayout({ children: <div>test</div> });
    expect(el.type).toBe(AccountShell);
    expect(el.props.navV2).toBe(true);
  });

  it("passes navV2 prop as false when flag is disabled", () => {
    mockIsNavV2Enabled = false;
    const el = AccountLayout({ children: <div>test</div> });
    expect(el.type).toBe(AccountShell);
    expect(el.props.navV2).toBe(false);
  });

  it("passes children through to AccountShell", () => {
    const childContent = "Test child content";
    render(
      <AccountLayout>
        <div>{childContent}</div>
      </AccountLayout>
    );
    expect(screen.getByText(childContent)).toBeTruthy();
  });

  describe("nested paths with navV2 enabled", () => {
    it("shows tabs and back link on /account/security/mfa with navV2 true", () => {
      mockPath = "/account/security/mfa";
      mockIsNavV2Enabled = true;
      render(
        <AccountLayout>
          <div>MFA content</div>
        </AccountLayout>
      );

      // Should show tabs
      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);

      // Should show back link
      const backButton = screen.getByRole("link", { name: "Account" });
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("data-slot")).toBe("back-button");
      expect(backButton.getAttribute("href")).toBe("/account");
    });

    it("shows tabs and back link on /account/info with navV2 true", () => {
      mockPath = "/account/info";
      mockIsNavV2Enabled = true;
      render(
        <AccountLayout>
          <div>Info content</div>
        </AccountLayout>
      );

      // Should show tabs
      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");

      // Should show back link
      const backButton = screen.getByRole("link", { name: "Account" });
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("data-slot")).toBe("back-button");
      expect(backButton.getAttribute("href")).toBe("/account");
    });

    it("hides back link on /account/info with navV2 false", () => {
      mockPath = "/account/info";
      mockIsNavV2Enabled = false;
      render(
        <AccountLayout>
          <div>Info content</div>
        </AccountLayout>
      );

      // Should still show tabs
      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);

      // Should NOT show back link
      const backButtons = screen.queryAllByRole("link");
      const hasBackButton = backButtons.some((link) => link.getAttribute("data-slot") === "back-button");
      expect(hasBackButton).toBe(false);
    });
  });
});
