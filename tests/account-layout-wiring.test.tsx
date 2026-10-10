/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

let mockPath = "/account";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPath,
}));

import AccountLayout from "@/app/(app)/account/layout";
import { AccountShell } from "@/components/account-shell";

beforeEach(() => {
  mockPath = "/account";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountLayout wiring (FINLYNQ_NAV_V2 retired: hub path only)", () => {
  it("renders AccountShell with no navV2 prop", () => {
    const el = AccountLayout({ children: <div>test</div> });
    expect(el.type).toBe(AccountShell);
    expect(el.props).not.toHaveProperty("navV2");
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

  describe("nested paths", () => {
    it("shows tabs and back link on /account/security/mfa", () => {
      mockPath = "/account/security/mfa";
      render(
        <AccountLayout>
          <div>MFA content</div>
        </AccountLayout>
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);

      const backButton = screen.getByRole("link", { name: "Back to Account" });
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("data-slot")).toBe("back-button");
      expect(backButton.getAttribute("href")).toBe("/account");
    });

    it("shows tabs and back link on /account/info", () => {
      mockPath = "/account/info";
      render(
        <AccountLayout>
          <div>Info content</div>
        </AccountLayout>
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");

      const backButton = screen.getByRole("link", { name: "Back to Account" });
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("data-slot")).toBe("back-button");
      expect(backButton.getAttribute("href")).toBe("/account");
    });
  });
});
