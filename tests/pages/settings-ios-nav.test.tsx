/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, screen, cleanup } from "@testing-library/react";
import { Plus } from "lucide-react";

let mockPath = "/settings/general";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
}));

import { SettingsShell } from "@/components/settings-shell";
import { SettingsHub } from "@/components/settings-hub";
import { PageHeader } from "@/components/mobile/page-header";

const cls = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);
const pillNav = (c: HTMLElement) => c.querySelector('nav[aria-label="Settings sections"]');

beforeEach(() => {
  mockPath = "/settings/general";
});

afterEach(() => {
  cleanup();
});

describe("Settings iOS multi-level menu: hub (level 1)", () => {
  it("renders grouped inset lists whose rows each have an icon tile and a chevron-right", () => {
    const { container } = render(<SettingsHub />);

    const groups = container.querySelectorAll('[data-slot="settings-hub-group"]');
    expect(groups.length).toBe(2);
    for (const g of Array.from(groups)) {
      expect(cls(g.querySelector(".rounded-2xl"))).toContain("bg-card");
    }

    const rows = container.querySelectorAll('[data-slot="settings-hub-row"]');
    expect(rows.length).toBe(7);
    rows.forEach((row) => {
      expect(row.querySelector('[data-slot="settings-hub-icon"] svg')).not.toBeNull();
      expect(cls(row.querySelector('[data-slot="settings-hub-chevron"]'))).toContain("text-muted-foreground");
    });
  });

  it("uses the shared bar title on phones (system text-base semibold; md+ keeps text-2xl)", () => {
    render(<SettingsHub />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Settings" });
    expect(cls(h1)).toContain("max-md:text-base");
    expect(cls(h1)).toContain("max-md:font-semibold");
    expect(cls(h1)).toContain("md:text-2xl");
  });
});

describe("Settings iOS multi-level menu: detail pages (level 2)", () => {
  it("renders no pill strip on phones when nav v2 is on, but keeps the desktop aside", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell hubBackHref="/settings">
        <div>Detail</div>
      </SettingsShell>
    );

    expect(pillNav(container)).toBeNull();
    const aside = container.querySelector('aside[aria-label="Settings sections"]');
    expect(aside).not.toBeNull();
    expect(cls(aside)).toContain("md:block");
  });

  it("keeps the pill strip when nav v2 is off (no hub to switch sections)", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell>
        <div>Detail</div>
      </SettingsShell>
    );
    expect(pillNav(container)).not.toBeNull();
  });

  it("puts a round 44px glass back button and the centred active section title in the shared glass bar", () => {
    mockPath = "/settings/investments";
    const { container } = render(
      <SettingsShell hubBackHref="/settings">
        <div>Detail</div>
      </SettingsShell>
    );

    const back = screen.getByRole("link", { name: "Back to Settings" });
    expect(back.getAttribute("href")).toBe("/settings");
    expect(cls(back)).toEqual(expect.arrayContaining(["glass-capsule", "max-md:size-11", "max-md:rounded-full"]));

    const title = container.querySelector('[data-slot="page-header-title-block"], span[aria-hidden].max-md\\:absolute');
    expect(title?.textContent).toBe("Investments");

    const row = back.parentElement;
    expect(row?.contains(title as Node)).toBe(true);
    expect(cls(row)).toEqual(expect.arrayContaining(["glass-bar", "max-md:sticky", "max-md:-mx-4"]));
    expect(cls(title)).toEqual(expect.arrayContaining(["max-md:absolute", "max-md:text-base", "max-md:font-semibold"]));
  });

  it("hides the page's own large h1 on phones but keeps it in the DOM", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell hubBackHref="/settings">
        <PageHeader title="General" titleClassName="text-2xl font-bold tracking-tight" />
      </SettingsShell>
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "General" });
    expect(h1).not.toBeNull();
    expect(cls(container.querySelector('[data-slot="settings-content"]'))).toContain("max-md:[&_[data-slot=page-header-title]]:sr-only");
  });
});

describe("PageHeader with backHref: phone glass header row", () => {
  it("renders a round glass back button and a centred title in the glass bar, with the h1 still present", () => {
    const { container } = render(<PageHeader title="Currency Review" backHref="/transactions" backLabel="Back to Transactions" />);

    const back = screen.getByRole("link", { name: "Back to Transactions" });
    expect(cls(back)).toEqual(expect.arrayContaining(["glass-capsule", "max-md:size-11", "max-md:rounded-full"]));

    const h1 = screen.getByRole("heading", { level: 1, name: "Currency Review" });
    expect(cls(h1)).toEqual(expect.arrayContaining(["max-md:truncate", "max-md:text-base", "max-md:font-semibold"]));
    expect(cls(h1)).not.toContain("glass-capsule");

    const row = container.querySelector('[data-slot="page-header"]');
    expect(cls(row)).toEqual(expect.arrayContaining(["glass-bar", "max-md:sticky"]));
    expect(row?.contains(back)).toBe(true);
    expect(row?.contains(h1)).toBe(true);
  });

  it("puts action buttons in the right column with equal glass material on phones", () => {
    const { container } = render(
      <PageHeader
        title="Accounts"
        backHref="/settings"
        actions={
          <>
            <button type="button" aria-label="Add">
              <Plus aria-hidden />
            </button>
          </>
        }
      />
    );
    const actions = container.querySelector('[data-slot="page-header-actions"]');
    expect(actions).not.toBeNull();
    expect(cls(actions)).toEqual(expect.arrayContaining(["glass-capsule", "max-md:h-11", "max-md:rounded-full"]));
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("collapses overflow actions into one labelled More trigger", () => {
    render(
      <PageHeader
        title="Groups"
        overflow={[
          { label: "Export", onSelect: () => {} },
          { label: "Import", onSelect: () => {} },
        ]}
      />
    );
    const triggers = screen.getAllByRole("button", { name: "More actions" });
    expect(triggers.length).toBe(1);
    expect(cls(triggers[0])).toContain("max-md:size-11");
  });

  it("ships the glass-capsule and glass-bar material phone-only in globals.css", () => {
    const css = readFileSync(resolve(__dirname, "../../src/app/globals.css"), "utf-8");
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*\.glass-capsule \{/);
    expect(css).toMatch(/\.glass-bar \{[^}]*blur\(28px\) saturate\(1\.8\)/);
    expect(css).toContain("prefers-reduced-transparency");
  });
});
