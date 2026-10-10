/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountHub } from "@/components/account-hub";
import { getEntriesBySurface } from "@/lib/nav-config";

describe("AccountHub", () => {
  beforeEach(() => {
    // Clear any global state if needed
  });

  it("renders all account entries from registry", () => {
    render(<AccountHub />);

    const expectedLabels = [
      "Info",
      "Security",
    ];

    for (const label of expectedLabels) {
      const element = screen.getByText(label);
      expect(element).toBeDefined();
    }
  });

  it("renders account entries in correct order", () => {
    render(<AccountHub />);

    const expectedOrder = [
      "Info",
      "Security",
    ];

    const links = screen.getAllByRole("link");
    const accountLinks = links.filter((l) => {
      const href = l.getAttribute("href");
      return href?.startsWith("/account/");
    });

    const actualLabels = accountLinks
      .slice(0, 2)
      .map((l) => {
        const titleSpan = l.querySelector("span.font-semibold");
        return titleSpan?.textContent?.trim();
      })
      .filter(Boolean);

    expect(actualLabels).toEqual(expectedOrder);
  });

  it("renders section card with Account label", () => {
    render(<AccountHub />);

    // SectionLabel renders as "Account" in sentence case
    const accountLabel = screen.getByText("Account");
    expect(accountLabel).toBeDefined();
  });

  it("renders each entry as a clickable link with correct href (exact match)", () => {
    render(<AccountHub />);

    const expectedPaths = [
      "/account/info",
      "/account/security",
    ];

    const links = screen.getAllByRole("link");
    const accountLinks = links
      .filter((l) => {
        const href = l.getAttribute("href");
        return href?.startsWith("/account/");
      })
      .map((l) => l.getAttribute("href"));

    expect(accountLinks).toEqual(expectedPaths);
  });

  it("renders entries with their registry icons in list-row-tile per row", () => {
    render(<AccountHub />);

    // Check that each account link has exactly one SVG icon in the list-row-tile slot
    const accountLinks = screen.getAllByRole("link")
      .filter((l) => {
        const href = l.getAttribute("href");
        return href?.startsWith("/account/");
      });

    expect(accountLinks.length).toBeGreaterThanOrEqual(2);

    accountLinks.forEach((link) => {
      const tileSvg = link.querySelector('[data-slot="list-row-tile"] svg');
      expect(tileSvg).not.toBeNull();
      expect(tileSvg).toBeDefined();
    });
  });

  it("renders entries with data-slot attributes for styling", () => {
    render(<AccountHub />);

    const listRows = screen.getAllByText(/Info|Security/);
    expect(listRows.length).toBeGreaterThan(0);

    const sectionCard = document.querySelector('[data-slot="section-card"]');
    expect(sectionCard).not.toBeNull();
  });

  it("consistency check: hub lists match registry account surface", () => {
    // This is a tautological consistency check: the hub is built from the registry,
    // so they should always match. Failure indicates the hub build logic broke.
    const registryEntries = getEntriesBySurface("account");
    const expectedCount = registryEntries.length;

    render(<AccountHub />);

    const links = screen.getAllByRole("link");
    const accountLinks = links.filter((l) => {
      const href = l.getAttribute("href");
      return href?.startsWith("/account/");
    });

    expect(accountLinks.length).toBe(expectedCount);
  });

  it("renders rows with proper visual structure", () => {
    render(<AccountHub />);

    const listRowContainers = document.querySelectorAll('[data-slot="list-row"]');
    expect(listRowContainers.length).toBeGreaterThanOrEqual(2);
  });

  it("renders each row with chevron for navigation", () => {
    render(<AccountHub />);

    const chevrons = document.querySelectorAll('[data-slot="list-row-chevron"]');
    expect(chevrons.length).toBeGreaterThanOrEqual(2);
  });

  it("verifies all entries have hrefs to their paths", () => {
    const registryEntries = getEntriesBySurface("account");

    render(<AccountHub />);

    const links = screen.getAllByRole("link");
    const accountLinks = links.filter((l) => l.getAttribute("href")?.startsWith("/account/"));

    const hrefs = accountLinks.map((l) => l.getAttribute("href"));

    for (const entry of registryEntries) {
      expect(hrefs).toContain(entry.path);
    }
  });

  it("renders hub with exactly the registry entries", () => {
    const registryEntries = getEntriesBySurface("account");

    render(<AccountHub />);

    const links = screen.getAllByRole("link");
    const accountLinks = links.filter((l) => l.getAttribute("href")?.startsWith("/account/"));

    expect(accountLinks.length).toBe(registryEntries.length);

    const hrefs = accountLinks.map((l) => l.getAttribute("href")).sort();
    const registryPaths = registryEntries.map((e) => e.path).sort();

    expect(hrefs).toEqual(registryPaths);
  });

  it("verifies no account surface entries have adminOnly or flag set", () => {
    const registryEntries = getEntriesBySurface("account");

    for (const entry of registryEntries) {
      expect(entry.adminOnly).toBeFalsy();
      expect(entry.flag).toBeFalsy();
    }
  });
});
