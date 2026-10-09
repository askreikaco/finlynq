/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
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

const detailBar = (c: HTMLElement) => c.querySelector('[data-slot="settings-detail-bar"]');

describe("Settings Shell (G2-06: hub is the level-2 switcher at every size)", () => {
  it("renders no settings section links on a sub-page (no aside, no pill row)", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const settingsLinks = screen
      .queryAllByRole("link")
      .filter((l) => (l.getAttribute("href") ?? "").startsWith("/settings/"));
    expect(settingsLinks.length).toBe(0);
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector('nav[aria-label="Settings sections"]')).toBeNull();
  });

  it("renders no detail bar on the hub page /settings", () => {
    mockPath = "/settings";
    const { container } = render(
      <SettingsShell>
        <div>Hub content</div>
      </SettingsShell>
    );

    expect(detailBar(container)).toBeNull();
    expect(screen.queryAllByRole("link", { name: "Back to Settings" })).toHaveLength(0);
    expect(screen.getByText("Hub content")).toBeTruthy();
  });

  it.each([
    ["/settings/general", "General"],
    ["/settings/investments", "Investments"],
    ["/settings/rules", "Reconciliation"],
    ["/connect", "Integrations"],
  ])("labels the detail bar for %s as %s (registry aliases apply)", (path, label) => {
    mockPath = path;
    const { container } = render(
      <SettingsShell>
        <div>Detail</div>
      </SettingsShell>
    );

    const title = detailBar(container)?.querySelector("span[aria-hidden]");
    expect(title?.textContent).toBe(label);
  });

  it("renders the back button to the hub on sub-pages", () => {
    mockPath = "/settings/general";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const backButton = screen.getByRole("link", { name: "Back to Settings" });
    expect(backButton.getAttribute("data-slot")).toBe("back-button");
    expect(backButton.getAttribute("href")).toBe("/settings");
  });

  it("does not render the back button on /settings/import/reconcile-visibility (page has its own)", () => {
    mockPath = "/settings/import/reconcile-visibility";
    render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const backButtons = screen.queryAllByRole("link").filter((l) => l.getAttribute("data-slot") === "back-button");
    expect(backButtons.length).toBe(0);
  });

  it("keeps the detail bar outside the overflow container, so its sticky position is not clipped", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>
    );

    const bar = detailBar(container) as HTMLElement;
    const content = container.querySelector('[data-slot="settings-content"]') as HTMLElement;
    expect(content.contains(bar)).toBe(false);
    expect(bar.nextElementSibling).toBe(content);
    expect(content.querySelector(".overflow-x-clip")?.textContent).toBe("Test content");
    expect(content.className).not.toMatch(/overflow-x-(auto|scroll)/);
  });

  it("renders children", () => {
    render(
      <SettingsShell>
        <div>Test content goes here</div>
      </SettingsShell>
    );

    expect(screen.getByText("Test content goes here")).toBeTruthy();
  });

  it("source has no viewport-split classes and no side nav or flag (ratchet of the G2-06 change)", () => {
    const src = readFileSync(resolve(__dirname, "../../src/components/settings-shell.tsx"), "utf-8");
    expect(src).not.toMatch(/max-md:|(^|[\s"'`])md:|(^|[\s"'`])lg:|hidden md:/);
    expect(src).not.toMatch(/<aside|CompactOnly|FromMd|hubBackHref|FINLYNQ_NAV_V2/);
    expect(src).not.toMatch(/PHONE_BAR_SIDE|pills/i);
  });
});
