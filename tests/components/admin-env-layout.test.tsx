/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

let mockPath = "/admin/system";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPath,
}));

import Layout from "@/app/(app)/admin/(env)/layout";

beforeEach(() => {
  mockPath = "/admin/system";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin Environment Layout", () => {
  it("renders the section nav (no stacked page heading) and 5 tabs in correct order", () => {
    render(
      <Layout>
        <div>Test content</div>
      </Layout>
    );

    expect(screen.getByRole("navigation", { name: "Environment sections" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();

    const links = screen.getAllByRole("link");
    const tabLinks = links.filter(l => l.getAttribute("href")?.startsWith("/admin/"));

    expect(tabLinks.length).toBe(5);
    expect(tabLinks[0].getAttribute("href")).toBe("/admin/system");
    expect(tabLinks[0].textContent).toContain("System");
    expect(tabLinks[1].getAttribute("href")).toBe("/admin/diagnostics");
    expect(tabLinks[1].textContent).toContain("Diagnostics");
    expect(tabLinks[2].getAttribute("href")).toBe("/admin/api-log");
    expect(tabLinks[2].textContent).toContain("API Log");
    expect(tabLinks[3].getAttribute("href")).toBe("/admin/price-cache");
    expect(tabLinks[3].textContent).toContain("Rate Cache");
    expect(tabLinks[4].getAttribute("href")).toBe("/admin/integrations");
    expect(tabLinks[4].textContent).toContain("Integrations");
  });

  it("sets aria-current=page on active tab (API Log)", () => {
    mockPath = "/admin/api-log";
    render(
      <Layout>
        <div>Test content</div>
      </Layout>
    );

    const links = screen.getAllByRole("link");
    const tabLinks = links.filter(l => l.getAttribute("href")?.startsWith("/admin/"));

    // Only API Log tab should have aria-current="page"
    expect(tabLinks[2].getAttribute("aria-current")).toBe("page");

    // All others should not have it
    for (let i = 0; i < tabLinks.length; i++) {
      if (i !== 2) {
        expect(tabLinks[i].getAttribute("aria-current")).not.toBe("page");
      }
    }
  });

  it("renders children", () => {
    render(
      <Layout>
        <div>Test content goes here</div>
      </Layout>
    );

    expect(screen.getByText("Test content goes here")).toBeTruthy();
  });

  it("renders correct icon classes for each tab", () => {
    render(
      <Layout>
        <div>Test content</div>
      </Layout>
    );

    const links = screen.getAllByRole("link");
    const tabLinks = links.filter(l => l.getAttribute("href")?.startsWith("/admin/"));

    const expectedIcons = [
      "lucide-server",      // System
      "lucide-scroll-text", // Diagnostics
      "lucide-activity",    // API Log
      "lucide-database",    // Rate Cache
      "lucide-plug",        // Integrations
    ];

    for (let i = 0; i < tabLinks.length; i++) {
      const svg = tabLinks[i].querySelector("svg");
      expect(svg?.className.baseVal).toContain(expectedIcons[i]);
    }
  });
});
