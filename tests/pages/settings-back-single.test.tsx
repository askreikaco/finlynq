/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

let mockPath = "/settings/about";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
}));

import { SettingsShell } from "@/components/settings-shell";
import { PageHeader } from "@/components/mobile/page-header";

afterEach(() => {
  cleanup();
});

const backs = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLAnchorElement>('[data-slot="back-button"]'));
const topBars = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-slot="page-header"]'));

function Host({ explicit, path }: { explicit: boolean; path: string }) {
  mockPath = path;
  return (
    <SettingsShell>
      {explicit ? (
        <PageHeader title="Security" backHref="/settings/investments?tab=securities" />
      ) : (
        <PageHeader title="About" />
      )}
    </SettingsShell>
  );
}

describe("settings sub-page: exactly one top bar and exactly one back control", () => {
  it("without an explicit backHref, the page's PageHeader backs to /settings (level 3 from the registry: /settings/about, /settings, /more)", () => {
    const { container } = render(<Host explicit={false} path="/settings/about" />);
    expect(topBars(container)).toHaveLength(1);
    const b = backs(container);
    expect(b).toHaveLength(1);
    expect(b[0].getAttribute("href")).toBe("/settings");
    expect(topBars(container)[0].contains(b[0])).toBe(true);
    expect(container.querySelector('[data-slot="settings-detail-bar"]')).toBeNull();
  });

  it("with an explicit backHref, the page's back is the only one", () => {
    const { container } = render(<Host explicit={true} path="/settings/investments/securities/new" />);
    expect(topBars(container)).toHaveLength(1);
    const b = backs(container);
    expect(b).toHaveLength(1);
    expect(b[0].getAttribute("href")).toBe("/settings/investments?tab=securities");
  });

  it("an explicit backHref on a level-2 page does not add a second back from the registry", () => {
    const { container } = render(<Host explicit={true} path="/settings/investments/securities/new" />);
    expect(backs(container).filter((a) => a.getAttribute("href") === "/settings")).toHaveLength(0);
  });
});
