/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";

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
    const expectedOrder = ["General", "Categories", "Reconciliation", "Investments", "Integrations", "Developer", "About"];

    let index = 0;
    for (const label of expectedOrder) {
      const link = links.find((l) => l.textContent?.includes(label));
      expect(link).toBeTruthy();
      expect(link?.getAttribute("href")).toBe(`/settings/${label.toLowerCase().replace(" ", "-").replace("general", "general").replace("categories", "categorization")}`);
    }
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

  it("renders children", () => {
    render(
      <SettingsShell>
        <div>Test content goes here</div>
      </SettingsShell>
    );

    expect(screen.getByText("Test content goes here")).toBeTruthy();
  });
});
