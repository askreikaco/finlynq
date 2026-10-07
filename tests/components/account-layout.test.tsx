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

import Layout from "@/app/(app)/account/layout";

beforeEach(() => {
  mockPath = "/account/info";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Account Layout", () => {
  describe("Hub page (/account)", () => {
    it("hides tab navigation on hub page", () => {
      mockPath = "/account";
      render(
        <Layout>
          <div>Hub content</div>
        </Layout>
      );

      const tabs = screen.queryAllByRole("tab");
      expect(tabs.length).toBe(0);
    });

    it("still renders heading and children on hub page", () => {
      mockPath = "/account";
      render(
        <Layout>
          <div>Hub content</div>
        </Layout>
      );

      expect(screen.getByText("Account")).toBeTruthy();
      expect(screen.getByText("Profile, login, API key, privacy, and backup / restore")).toBeTruthy();
      expect(screen.getByText("Hub content")).toBeTruthy();
    });
  });

  describe("Sub-pages with tabs", () => {
    it("renders heading and account tabs in correct order on /account/info", () => {
      mockPath = "/account/info";
      render(
        <Layout>
          <div>Test content</div>
        </Layout>
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
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");
      expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    });

    it("sets aria-selected=true on active tab (Security)", () => {
      mockPath = "/account/security";
      render(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(2);
      expect(tabs[0].getAttribute("aria-selected")).toBe("false");
      expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    });

    it("renders children on sub-pages", () => {
      mockPath = "/account/info";
      render(
        <Layout>
          <div>Test content goes here</div>
        </Layout>
      );

      expect(screen.getByText("Test content goes here")).toBeTruthy();
    });
  });
});
