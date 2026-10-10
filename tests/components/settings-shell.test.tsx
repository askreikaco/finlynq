/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, screen, cleanup } from "@testing-library/react";

let mockPath = "/settings/general";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPath,
}));

import { SettingsShell } from "@/components/settings-shell";
import { SettingsHub } from "@/components/settings-hub";
import { PageHeader, PHONE_BAR_TITLE } from "@/components/mobile/page-header";

afterEach(() => {
  cleanup();
});

const topBars = (c: HTMLElement) => c.querySelectorAll('[data-slot="page-header"]');
const backs = (c: HTMLElement) => c.querySelectorAll('[data-slot="back-button"]');
const shellSrc = readFileSync(resolve(__dirname, "../../src/components/settings-shell.tsx"), "utf-8");

describe("Settings shell: no top bar of its own (the page's PageHeader is the one top bar)", () => {
  it("a sub-page without a PageHeader gets no bar and no back from the shell", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>,
    );
    expect(topBars(container)).toHaveLength(0);
    expect(backs(container)).toHaveLength(0);
    expect(container.querySelector('[data-slot="settings-detail-bar"]')).toBeNull();
    expect(screen.getByText("Test content")).toBeTruthy();
  });

  it("a sub-page with a PageHeader has exactly one top bar and exactly one back control", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell>
        <PageHeader title="General" />
      </SettingsShell>,
    );
    expect(topBars(container)).toHaveLength(1);
    expect(backs(container)).toHaveLength(1);
    expect(backs(container)[0].getAttribute("href")).toBe("/settings");
    expect(topBars(container)[0].contains(backs(container)[0])).toBe(true);
  });

  it("the page title is the visible centred title of its PageHeader (no sr-only copy, no alias label)", () => {
    mockPath = "/settings/investments/securities/new";
    render(
      <SettingsShell>
        <PageHeader title="Add security" backHref="/settings/investments?tab=securities" />
      </SettingsShell>,
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "Add security" });
    expect(h1.className).not.toContain("sr-only");
    expect(h1.textContent).toBe("Add security");
    for (const token of PHONE_BAR_TITLE.split(/\s+/)) {
      expect(h1.className.split(/\s+/)).toContain(token);
    }
    expect(screen.queryByText("Investments", { selector: "span[aria-hidden]" })).toBeNull();
  });

  it("the hub /settings renders its PageHeader as the one top bar, backing to /more (level 2)", () => {
    mockPath = "/settings";
    const { container } = render(
      <SettingsShell>
        <SettingsHub />
      </SettingsShell>,
    );
    expect(topBars(container)).toHaveLength(1);
    const h1 = screen.getByRole("heading", { level: 1, name: "Settings" });
    expect(topBars(container)[0].contains(h1)).toBe(true);
    expect(backs(container)).toHaveLength(1);
    expect(backs(container)[0].getAttribute("href")).toBe("/more");
    expect(container.querySelector('[data-slot="settings-detail-bar"]')).toBeNull();
  });

  it("renders children", () => {
    render(
      <SettingsShell>
        <div>Test content goes here</div>
      </SettingsShell>,
    );
    expect(screen.getByText("Test content goes here")).toBeTruthy();
  });

  it("keeps the content slot out of any scroll container, so the page's sticky header pins to the window", () => {
    const { container } = render(
      <SettingsShell>
        <div>Test content</div>
      </SettingsShell>,
    );
    const slot = container.querySelector('[data-slot="settings-content"]') as HTMLElement;
    expect(slot.className).not.toMatch(/overflow-x-(auto|scroll)/);
    expect(slot.querySelector(".overflow-x-clip")?.textContent).toBe("Test content");
  });

  it("source: no hand-built bar, no PHONE_BAR primitives, no back context, no sr-only title hack, no viewport split", () => {
    expect(shellSrc).not.toMatch(/PHONE_BAR|HEADER_TITLE_CLASS|BackButton|settings-detail-bar/);
    expect(shellSrc).not.toMatch(/SettingsBackContext|settings-back-context|SUB_PAGE_HEADER_OVERRIDES|sr-only/);
    expect(shellSrc).not.toMatch(/usePathname|NAV_ITEMS|ROUTE_GROUP|SELF_BACK_PATHS/);
    expect(shellSrc).not.toMatch(/max-md:|(^|[\s"'`])md:|(^|[\s"'`])lg:|hidden md:/);
    expect(shellSrc).not.toMatch(/<aside|CompactOnly|FromMd|hubBackHref|FINLYNQ_NAV_V2/);
    expect(shellSrc).not.toMatch(/PHONE_BAR_SIDE|pills/i);
  });
});
