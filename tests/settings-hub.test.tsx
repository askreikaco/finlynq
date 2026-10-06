/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsHub } from "@/components/settings-hub";
import { getEntriesBySurface } from "@/lib/nav-config";

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
        const titleSpan = l.querySelector("span.text-\\[15px\\]");
        return titleSpan?.textContent?.trim();
      })
      .filter(Boolean);

    expect(actualLabels).toEqual(expectedOrder);
  });

  it("renders section card with Settings label", () => {
    render(<SettingsHub />);

    // SectionLabel renders as "Settings" in sentence case
    const settingsLabel = screen.getByText("Settings");
    expect(settingsLabel).toBeDefined();
  });

  it("renders each entry as a clickable link with correct href", () => {
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
    const settingsLinks = links
      .filter((l) => {
        const href = l.getAttribute("href");
        return expectedPaths.includes(href || "");
      })
      .map((l) => l.getAttribute("href"));

    expect(settingsLinks).toEqual(expectedPaths);
  });

  it("renders entries with their registry icons", () => {
    render(<SettingsHub />);

    // Check that SVGs are rendered (icons)
    const svgs = screen.getAllByRole("link")
      .filter((l) => {
        const href = l.getAttribute("href");
        return href?.startsWith("/settings/");
      })
      .map((l) => l.querySelector("svg"));

    expect(svgs.length).toBeGreaterThanOrEqual(7);
    svgs.forEach((svg) => {
      expect(svg).not.toBeNull();
    });
  });

  it("renders entries with data-slot attributes for styling", () => {
    render(<SettingsHub />);

    const listRows = screen.getAllByText(/General|Categories|Reconciliation/);
    expect(listRows.length).toBeGreaterThan(0);

    const sectionCard = document.querySelector('[data-slot="section-card"]');
    expect(sectionCard).not.toBeNull();
  });

  it("verifies hub lists match registry settings surface", () => {
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

  it("renders rows with proper visual structure", () => {
    render(<SettingsHub />);

    const listRowContainers = document.querySelectorAll('[data-slot="list-row"]');
    expect(listRowContainers.length).toBeGreaterThanOrEqual(7);
  });

  it("renders each row with chevron for navigation", () => {
    render(<SettingsHub />);

    const chevrons = document.querySelectorAll('[data-slot="list-row-chevron"]');
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
});
