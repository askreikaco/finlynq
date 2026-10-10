/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resolvedDecls } from "../helpers/css-tokens";
import { render, screen, cleanup } from "@testing-library/react";
import { Plus } from "lucide-react";

let mockPath = "/settings/general";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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

  it("uses the shared bar title: text-base semibold below regular, text-3xl/9 extrabold from regular", () => {
    render(<SettingsHub />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Settings" });
    expect(cls(h1)).toContain("max-regular:text-base");
    expect(cls(h1)).toContain("max-regular:font-semibold");
    expect(cls(h1)).toEqual(expect.arrayContaining(["text-3xl/9", "font-extrabold"]));
  });
});

describe("Settings detail pages (level 3): the page's PageHeader is the one top bar at every size", () => {
  it("renders no pill strip and no side nav at any size (the hub is the only section switcher)", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell>
        <PageHeader title="General" />
      </SettingsShell>
    );
    expect(pillNav(container)).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector('[data-slot="settings-detail-bar"]')).toBeNull();
  });

  it("puts a round glass back button to the hub and the centred page title in the page's glass bar", () => {
    mockPath = "/settings/investments";
    const { container } = render(
      <SettingsShell>
        <PageHeader title="Investments" subtitle="Your securities" />
      </SettingsShell>
    );
    const bar = container.querySelector('[data-slot="page-header"]');
    expect(container.querySelectorAll('[data-slot="page-header"]')).toHaveLength(1);

    const back = screen.getByRole("link", { name: "Back" });
    expect(back.getAttribute("href")).toBe("/settings");
    expect(cls(back)).toEqual(expect.arrayContaining(["glass-capsule", "max-regular:size-11", "max-regular:rounded-full"]));
    expect(bar?.contains(back)).toBe(true);
    expect(cls(bar)).toEqual(expect.arrayContaining(["glass-bar", "sticky", "max-regular:-mx-4", "regular:bg-background/90"]));

    const title = screen.getByRole("heading", { level: 1, name: "Investments" });
    expect(bar?.contains(title)).toBe(true);
    expect(cls(title)).toEqual(expect.arrayContaining(["text-3xl/9", "font-extrabold", "max-regular:text-base", "max-regular:text-center"]));
    expect(cls(bar?.querySelector('[data-slot="page-header-title-block"]'))).toContain("max-regular:items-center");
  });

  it("the page header is never hidden at any size (no viewport-only display classes)", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell>
        <PageHeader title="General" />
      </SettingsShell>
    );
    const bar = container.querySelector('[data-slot="page-header"]');
    const title = screen.getByRole("heading", { level: 1, name: "General" });
    for (const el of [bar, title]) {
      expect(cls(el)).not.toContain("hidden");
      expect(cls(el).some((c) => /^max-md:|^md:/.test(c))).toBe(false);
    }
  });

  it("the page's PageHeader stays sticky: the shell adds no static override or sr-only title", () => {
    mockPath = "/settings/general";
    const { container } = render(
      <SettingsShell>
        <PageHeader title="General" subtitle="Preferences" />
      </SettingsShell>
    );
    const bar = container.querySelector('[data-slot="page-header"]');
    expect(cls(bar)).toEqual(expect.arrayContaining(["sticky", "glass-bar"]));
    expect(cls(bar)).not.toContain("static");
    const content = container.querySelector('[data-slot="settings-content"]');
    expect(content?.className).not.toContain("[&_[data-slot=page-header]]:static");
    expect(content?.className).not.toContain("sr-only");
    expect(screen.getByRole("heading", { level: 1, name: "General" }).className).not.toContain("sr-only");
  });

  it("the reconcile-visibility page keeps its own explicit back button and no second one", () => {
    mockPath = "/settings/import/reconcile-visibility";
    const { container } = render(
      <SettingsShell>
        <PageHeader title="Reconcile dropdown visibility" backHref="/settings/import" backLabel="Back to Import settings" />
      </SettingsShell>
    );
    expect(container.querySelectorAll('[data-slot="back-button"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Back to Import settings" }).getAttribute("href")).toBe("/settings/import");
  });
});

describe("PageHeader with backHref: phone glass header row", () => {
  it("renders a round glass back button and a centred title in the glass bar, with the h1 still present", () => {
    const { container } = render(<PageHeader title="Currency Review" backHref="/transactions" backLabel="Back to Transactions" />);

    const back = screen.getByRole("link", { name: "Back to Transactions" });
    expect(cls(back)).toEqual(expect.arrayContaining(["glass-capsule", "max-regular:size-11", "max-regular:rounded-full"]));

    const h1 = screen.getByRole("heading", { level: 1, name: "Currency Review" });
    expect(cls(h1)).toEqual(expect.arrayContaining(["max-regular:truncate", "max-regular:text-base", "max-regular:font-semibold"]));
    expect(cls(h1)).not.toContain("glass-capsule");

    const row = container.querySelector('[data-slot="page-header"]');
    expect(cls(row)).toEqual(expect.arrayContaining(["glass-bar", "sticky"]));
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
    // a lone primary is the single neutral cell of the capsule (no accent circle beside it)
    expect(container.querySelector('[data-slot="header-capsule"]')?.querySelector('[aria-label="Add"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="header-primary"]')).toBeNull();
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
    expect(cls(triggers[0])).toContain("pointer-coarse:size-11");
  });

  it("ships the glass-capsule and glass-bar material phone-only in globals.css", () => {
    const css = readFileSync(resolve(__dirname, "../../src/app/globals.css"), "utf-8");
    expect(css).toMatch(/@media \(width < 40rem\) \{\s*\.glass-capsule \{/);
    // Literal blur/saturate moved into --glass-bar-* tokens; assert the resolved .glass-bar rule.
    expect(resolvedDecls(css, ".glass-bar", "light")).toMatch(/blur\(28px\) saturate\(1\.8\)/);
    expect(css).toContain("prefers-reduced-transparency");
  });
});
