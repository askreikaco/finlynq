/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

let mockPath = "/settings/general";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
}));

import { SettingsShell } from "@/components/settings-shell";

beforeEach(() => {
  mockPath = "/settings/general";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Settings Shell", () => {
  it("renders settings nav items in correct order with correct labels", () => {
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const links = screen.getAllByRole("link");
    const expectedHrefs = [
      "/settings/general",
      "/settings/categorization",
      "/settings/reconciliation",
      "/settings/investments",
      "/settings/integrations",
      "/settings/developer",
      "/settings/about",
    ];

    // Filter to only settings links
    const settingsLinks = links.filter((l) => {
      const href = l.getAttribute("href");
      return href?.startsWith("/settings/");
    });

    // Take only the first 7 (one instance of each settings link)
    const actualHrefs = settingsLinks.slice(0, 7).map((l) => l.getAttribute("href"));
    expect(actualHrefs).toEqual(expectedHrefs);
  });

  it("renders correct icon classes for each settings entry", () => {
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const links = screen.getAllByRole("link");
    const expectedIcons = [
      { label: "General", icon: "lucide-settings-2" },
      { label: "Categories", icon: "lucide-tag" },
      { label: "Reconciliation", icon: "lucide-link-2" },
      { label: "Investments", icon: "lucide-briefcase" },
      { label: "Integrations", icon: "lucide-server" },
      { label: "Developer", icon: "lucide-wrench" },
      { label: "About", icon: "lucide-info" },
    ];

    for (const expected of expectedIcons) {
      const link = links.find((l) => l.textContent?.includes(expected.label));
      expect(link).toBeTruthy();
      const svg = link?.querySelector("svg");
      expect(svg?.className.baseVal).toContain(expected.icon);
    }
  });

  it("highlights active link with aria-current=page on General", () => {
    mockPath = "/settings/general";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const links = screen.getAllByRole("link");
    const generalLink = links.find((l) => l.textContent?.includes("General"));
    expect(generalLink?.getAttribute("aria-current")).toBe("page");
  });

  it("highlights active link with aria-current=page on Investments", () => {
    mockPath = "/settings/investments";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const links = screen.getAllByRole("link");
    const investmentsLink = links.find((l) => l.textContent?.includes("Investments"));
    expect(investmentsLink?.getAttribute("aria-current")).toBe("page");
  });

  it("uses alias to highlight Reconciliation when on /settings/rules", () => {
    mockPath = "/settings/rules";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const links = screen.getAllByRole("link");
    const reconciliationLink = links.find((l) => l.textContent?.includes("Reconciliation"));
    expect(reconciliationLink?.getAttribute("aria-current")).toBe("page");
  });

  it("uses alias to highlight Integrations when on /connect", () => {
    mockPath = "/connect";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const links = screen.getAllByRole("link");
    const integrationsLink = links.find((l) => l.textContent?.includes("Integrations"));
    expect(integrationsLink?.getAttribute("aria-current")).toBe("page");
  });

  it("hides nav (mobile pill bar and desktop nav) when on hub page /settings", () => {
    mockPath = "/settings";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    // When on /settings (hub page), nav items should not be rendered
    const links = screen.queryAllByRole("link");
    // All links should be filtered out (no settings nav links shown)
    const settingsLinks = links.filter((l) => {
      const href = l.getAttribute("href");
      return href?.startsWith("/settings/");
    });
    expect(settingsLinks.length).toBe(0);
  });

  it("renders nav items (mobile pill bar and desktop nav) when on a settings sub-page", () => {
    mockPath = "/settings/general";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    // When on a sub-page like /settings/general, nav items should be rendered
    const links = screen.getAllByRole("link");
    const settingsLinks = links.filter((l) => {
      const href = l.getAttribute("href");
      return href?.startsWith("/settings/");
    });
    // Should have at least 7 settings links (once per nav item)
    expect(settingsLinks.length).toBeGreaterThanOrEqual(7);
  });

  it("renders children", () => {
    render(
      <SettingsShell>
        <div>Test content goes here</div>
      </SettingsShell>
    );

    expect(screen.getByText("Test content goes here")).toBeTruthy();
  });

  it("renders back button when hubBackHref is set and not on hub page", () => {
    mockPath = "/settings/general";
    render(
      <SettingsShell hubBackHref="/settings">
        <div>Test content</div>
      </SettingsShell>
    );

    const backButton = screen.getByRole("link", { name: "Back to Settings" });
    expect(backButton).toBeDefined();
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");
    expect(backButton?.getAttribute("href")).toBe("/settings");
  });

  it("does not render back button when hubBackHref is not set", () => {
    mockPath = "/settings/general";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const backButtons = screen.queryAllByRole("link");
    const hasBackButton = backButtons.some((link) => link.getAttribute("data-slot") === "back-button");
    expect(hasBackButton).toBe(false);
  });

  it("does not render back button when on hub page even if hubBackHref is set", () => {
    mockPath = "/settings";
    render(
      <SettingsShell hubBackHref="/settings">
        <div>Test content</div>
      </SettingsShell>
    );

    const backButtons = screen.queryAllByRole("link");
    const hasBackButton = backButtons.some((link) => link.getAttribute("data-slot") === "back-button");
    expect(hasBackButton).toBe(false);
  });

  it("renders back button inside content slot (not as sibling of aside at md+)", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell hubBackHref="/settings">
        <div>Test content</div>
      </SettingsShell>
    );

    // Find the back button
    const backButton = screen.getByRole("link", { name: "Back to Settings" });

    // Find the aside element (desktop nav)
    const aside = container.querySelector("aside");

    // Find the content slot (the settings-content data slot)
    const contentSlot = container.querySelector('[data-slot="settings-content"]');

    // Verify back button is inside content slot, not a sibling of aside
    expect(contentSlot?.contains(backButton)).toBe(true);
    expect(aside?.contains(backButton)).toBe(false);
  });

  it("does not render hub back button when on /settings/import/reconcile-visibility (page with self back button)", () => {
    mockPath = "/settings/import/reconcile-visibility";
    render(
      <SettingsShell hubBackHref="/settings">
        <div>Test content</div>
      </SettingsShell>
    );

    const backButtons = screen.queryAllByRole("link");
    const hasHubBackButton = backButtons.some((link) => link.getAttribute("data-slot") === "back-button");
    expect(hasHubBackButton).toBe(false);
  });

  it("still renders back button on /settings/general with hubBackHref set", () => {
    mockPath = "/settings/general";
    render(
      <SettingsShell hubBackHref="/settings">
        <div>Test content</div>
      </SettingsShell>
    );

    const backButton = screen.getByRole("link", { name: "Back to Settings" });
    expect(backButton).toBeDefined();
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");
  });
});
