/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, cleanup } from "@testing-library/react";

let mockPath = "/transactions";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
}));

import { AppMainBarFlag } from "@/components/app-main-bar-flag";

afterEach(() => {
  cleanup();
});

function Shell({ path }: { path: string }) {
  mockPath = path;
  return (
    <main data-app-main="">
      <AppMainBarFlag />
      <div>content</div>
    </main>
  );
}

describe("AppMainBarFlag: bottom padding follows whether the tab bar is shown", () => {
  it("marks main when the tab bar is hidden (full-screen edit route)", () => {
    const { container } = render(<Shell path="/transactions/12/edit" />);
    expect(container.querySelector("main")!.hasAttribute("data-bar-hidden")).toBe(true);
  });

  it("does not mark main on a tab page", () => {
    const { container } = render(<Shell path="/transactions" />);
    expect(container.querySelector("main")!.hasAttribute("data-bar-hidden")).toBe(false);
  });

  it("removes the mark when navigating back to a tab page", () => {
    const { container, rerender } = render(<Shell path="/transactions/12/edit" />);
    expect(container.querySelector("main")!.hasAttribute("data-bar-hidden")).toBe(true);
    rerender(<Shell path="/transactions" />);
    expect(container.querySelector("main")!.hasAttribute("data-bar-hidden")).toBe(false);
  });
});

describe("layout wiring", () => {
  const layout = readFileSync(resolve(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");

  it("keeps the bar clearance padding and adds the bar-hidden variant (safe-area bottom only)", () => {
    expect(layout).toContain("pb-[calc(var(--mobile-bar-clearance)+80px)] regular:pb-0");
    expect(layout).toContain("data-[bar-hidden]:max-regular:pb-[var(--sab,0px)]");
  });

  it("mounts the flag inside <main>, which keeps data-app-main", () => {
    const main = layout.slice(layout.indexOf("<main"), layout.indexOf("</main>"));
    expect(main).toContain('data-app-main=""');
    expect(main).toContain("<AppMainBarFlag />");
  });
});
