/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

let mockPath = "/settings/about";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
}));

import { SettingsShell } from "@/components/settings-shell";
import { PageHeader } from "@/components/mobile/page-header";

afterEach(() => {
  cleanup();
});

const backs = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLAnchorElement>('[data-slot="back-button"]'));

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

describe("settings sub-page: exactly one back control", () => {
  it("without an explicit backHref, the shell bar's back is the only one (to /settings)", () => {
    const { container } = render(<Host explicit={false} path="/settings/about" />);
    const b = backs(container);
    expect(b).toHaveLength(1);
    expect(b[0].getAttribute("aria-label")).toBe("Back to Settings");
    expect(b[0].getAttribute("href")).toBe("/settings");
    expect(container.querySelector('[data-slot="settings-detail-bar"]')).not.toBeNull();
  });

  it("with an explicit backHref, the page's back is the only one and the shell bar stays for the title", () => {
    const { container } = render(<Host explicit={true} path="/settings/investments/securities/new" />);
    const b = backs(container);
    expect(b).toHaveLength(1);
    expect(b[0].getAttribute("href")).toBe("/settings/investments?tab=securities");
    expect(container.querySelector('[data-slot="settings-detail-bar"]')).not.toBeNull();
  });

  it("the shell back returns when a page with an explicit backHref unmounts", () => {
    const { container, rerender } = render(<Host explicit={true} path="/settings/investments/securities/new" />);
    expect(backs(container)).toHaveLength(1);
    rerender(<Host explicit={false} path="/settings/investments/securities/new" />);
    const b = backs(container);
    expect(b).toHaveLength(1);
    expect(b[0].getAttribute("aria-label")).toBe("Back to Settings");
  });
});
