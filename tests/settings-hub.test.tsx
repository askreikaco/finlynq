/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsHub } from "@/components/settings-hub";
import { SettingsShell } from "@/components/settings-shell";
import { getEntriesBySurface } from "@/lib/nav-config";

// Mock next/navigation to provide usePathname
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/settings"),
}));

describe("SettingsHub", () => {
  beforeEach(() => {
    // Clear any global state if needed
  });

  it("renders all settings entries from registry", () => {
    render(<SettingsHub />);

    const expectedLabels = [
      "General",
      "Categories",
      "Reconciliation",
      "Investments",
      "Integrations",
      "Developer",
      "About",
    ];

    for (const label of expectedLabels) {
      const element = screen.getByText(label);
      expect(element).toBeDefined();
    }
  });

  it("renders settings entries in correct order", () => {
    render(<SettingsHub />);

    const expectedOrder = [
      "General",
      "Categories",
      "Reconciliation",
      "Investments",
      "Integrations",
      "Developer",
      "About",
    ];

    const links = screen.getAllByRole("link");
    const settingsLinks = links.filter((l) => {
      const href = l.getAttribute("href");
      return href?.startsWith("/settings/");
    });

    const actualLabels = settingsLinks
      .slice(0, 7)
      .map((l) => {
        // Row label is the truncating span (size token changed from text-[17px] to text-base).
        const titleSpan = l.querySelector("span.truncate");
        return titleSpan?.textContent?.trim();
      })
      .filter(Boolean);

    expect(actualLabels).toEqual(expectedOrder);
  });

  it("renders grouped inset lists without a separate label (title is the page title)", () => {
    render(<SettingsHub />);

    // SectionCard is rendered without a label prop, so no separate section-label element
    const settingsLabel = document.querySelector('[data-slot="section-label"]');
    expect(settingsLabel).toBeNull();

    // But the page title should still be "Settings" from PageHeader
    const pageTitle = screen.getByRole("heading", { level: 1, name: "Settings" });
    expect(pageTitle).toBeDefined();
  });

  it("renders each entry as a clickable link with correct href (exact match)", () => {
    render(<SettingsHub />);

    const expectedPaths = [
      "/settings/general",
      "/settings/categorization",
      "/settings/reconciliation",
      "/settings/investments",
      "/settings/integrations",
      "/settings/developer",
      "/settings/about",
    ];

    const links = screen.getAllByRole("link");
    const settingsLinks = links.filter((l) => {
      const href = l.getAttribute("href");
      return href?.startsWith("/settings/");
    }).map((l) => l.getAttribute("href"));

    expect(settingsLinks).toEqual(expectedPaths);
  });

  it("renders entries with their registry icons in an icon tile per row", () => {
    render(<SettingsHub />);

    // Check that each settings link has exactly one SVG icon in the settings-hub-icon tile
    const settingsLinks = screen.getAllByRole("link")
      .filter((l) => {
        const href = l.getAttribute("href");
        return href?.startsWith("/settings/");
      });

    expect(settingsLinks.length).toBeGreaterThanOrEqual(7);

    settingsLinks.forEach((link) => {
      const tileSvg = link.querySelector('[data-slot="settings-hub-icon"] svg');
      expect(tileSvg).not.toBeNull();
      expect(tileSvg).toBeDefined();
    });
  });

  it("renders entries with data-slot attributes for styling (grouped list)", () => {
    render(<SettingsHub />);

    const listRows = screen.getAllByText(/General|Categories|Reconciliation/);
    expect(listRows.length).toBeGreaterThan(0);

    const sectionCard = document.querySelector('[data-slot="settings-hub-group"]');
    expect(sectionCard).not.toBeNull();
  });

  it("consistency check: hub lists match registry settings surface", () => {
    // This is a tautological consistency check: the hub is built from the registry,
    // so they should always match. Failure indicates the hub build logic broke.
    const registryEntries = getEntriesBySurface("settings");
    const expectedCount = registryEntries.length;

    render(<SettingsHub />);

    const links = screen.getAllByRole("link");
    const settingsLinks = links.filter((l) => {
      const href = l.getAttribute("href");
      return href?.startsWith("/settings/");
    });

    expect(settingsLinks.length).toBe(expectedCount);
  });

  it("renders rows with proper visual structure (inset row links)", () => {
    render(<SettingsHub />);

    const listRowContainers = document.querySelectorAll('[data-slot="settings-hub-row"]');
    expect(listRowContainers.length).toBeGreaterThanOrEqual(7);
  });

  it("renders each row with chevron-right for navigation", () => {
    render(<SettingsHub />);

    const chevrons = document.querySelectorAll('[data-slot="settings-hub-chevron"]');
    expect(chevrons.length).toBeGreaterThanOrEqual(7);
  });

  it("verifies all entries have hrefs to their paths", () => {
    const registryEntries = getEntriesBySurface("settings");

    render(<SettingsHub />);

    const links = screen.getAllByRole("link");
    const settingsLinks = links.filter((l) => l.getAttribute("href")?.startsWith("/settings/"));

    const hrefs = settingsLinks.map((l) => l.getAttribute("href"));

    for (const entry of registryEntries) {
      expect(hrefs).toContain(entry.path);
    }
  });

  it("verifies no settings surface entries have adminOnly or flag set", () => {
    const registryEntries = getEntriesBySurface("settings");

    for (const entry of registryEntries) {
      expect(entry.adminOnly).toBeFalsy();
      expect(entry.flag).toBeFalsy();
    }
  });

  it("renders a page title using PageHeader", () => {
    render(<SettingsHub />);

    const title = screen.getByRole("heading", { level: 1, name: "Settings" });
    expect(title).toBeDefined();
    expect(title.tagName).toBe("H1");
  });

  it("hub is the level-1 page at every size: no detail bar, pill strip or side nav around it", () => {
    render(
      <SettingsShell>
        <SettingsHub />
      </SettingsShell>
    );

    const sectionCard = document.querySelector('[data-slot="settings-hub-group"]');
    expect(sectionCard).not.toBeNull();
    expect(document.querySelector('[data-slot="settings-detail-bar"]')).toBeNull();
    expect(document.querySelector('nav[aria-label="Settings sections"]')).toBeNull();
    expect(document.querySelector('aside[aria-label="Settings sections"]')).toBeNull();
  });

  it("hub is a centred column (max-w-xl, wide:max-w-3xl) with two group columns from wide", () => {
    const { container } = render(<SettingsHub />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toEqual(expect.stringContaining("max-w-xl"));
    expect(root.className).toEqual(expect.stringContaining("wide:max-w-3xl"));
    const grid = container.querySelector('[data-slot="settings-hub-group"]')?.parentElement as HTMLElement;
    expect(grid.className).toEqual(expect.stringContaining("wide:grid-cols-2"));
  });
});
