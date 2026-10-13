/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { PageHeader, HEADER_SECONDARY, HEADER_DESKTOP_ONLY } from "@/components/mobile";
import {
  PHONE_BAR,
  PHONE_BAR_STICKY,
  PHONE_CAPSULE,
  PHONE_BAR_TITLE,
  PHONE_BAR_SUBTITLE,
} from "@/components/mobile/page-header";

afterEach(cleanup);
const cls = (el: Element) => el.className.toString().split(/\s+/);
const SOURCE = fs.readFileSync(path.join(process.cwd(), "src/components/mobile/page-header.tsx"), "utf-8");

describe("PageHeader v2: one bar at every width", () => {
  it("the bar classes are unconditional (no max-regular / regular / max-md variants)", () => {
    expect(PHONE_BAR).toContain(" grid ");
    expect(PHONE_BAR).toContain("min-h-[var(--phone-header-h)]");
    expect(PHONE_BAR).toContain("page-header-bleed");
    expect(PHONE_BAR).not.toMatch(/(max-)?(regular|wide|md):/);
    expect(PHONE_CAPSULE).toContain("max-w-[11rem]");
    expect(PHONE_CAPSULE).not.toMatch(/(max-)?regular:/);
    expect(PHONE_BAR_TITLE).toContain("text-base");
    expect(PHONE_BAR_SUBTITLE).toContain("text-xs");
  });

  it("the bar is glass and sticky at every size, pinned at the safe-area inset", () => {
    expect(PHONE_BAR_STICKY.split(/\s+/)).toEqual(expect.arrayContaining(["glass-bar", "sticky", "top-[var(--sat,0px)]"]));
    expect(PHONE_BAR_STICKY).not.toMatch(/regular:/);
    expect(PHONE_BAR_STICKY.split(/\s+/)).not.toContain("max-regular:sticky");
  });

  it("the rendered title block and h1 carry the one style", () => {
    render(<PageHeader title="Dashboard" subtitle="Today" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(cls(h1)).toEqual(expect.arrayContaining(["text-base", "font-semibold"]));
    expect(cls(h1)).not.toContain("font-extrabold");
    const sub = screen.getByText("Today");
    expect(cls(sub)).toEqual(expect.arrayContaining(["text-xs"]));
    expect(cls(sub)).not.toContain("text-sm");
  });
});

describe("PageHeader v2: secondary actions", () => {
  it("HEADER_SECONDARY is hidden at every width (marker token + hidden, no breakpoint variant)", () => {
    expect(HEADER_SECONDARY).toBe("header-secondary hidden");
  });

  it("HEADER_DESKTOP_ONLY is an alias: same value, so existing callers keep the same behaviour", () => {
    expect(HEADER_DESKTOP_ONLY).toBe(HEADER_SECONDARY);
  });

  it("a secondary action is removed from the phone primary slot and not given the icon-only class", () => {
    render(
      <PageHeader
        title="Portfolio"
        overflow={[{ label: "Export", onSelect: () => {} }]}
        actions={
          <>
            <button className={HEADER_DESKTOP_ONLY}>Export</button>
            <button>Add</button>
          </>
        }
      />,
    );
    expect(cls(screen.getByText("Export", { selector: "button" }))).toContain("hidden");
    expect(cls(screen.getByText("Add"))).toContain("phone-icon-action");
  });
});

describe("PageHeader v2: deprecated props are accepted and ignored", () => {
  it("titleClassName and subtitleClassName do not change the rendered classes", () => {
    render(<PageHeader title="Ignored" subtitle="sub" titleClassName="text-2xl font-bold md:text-4xl" subtitleClassName="text-lg" />);
    const h1 = cls(screen.getByRole("heading", { level: 1 }));
    expect(h1).not.toContain("font-bold");
    expect(h1).not.toContain("md:text-4xl");
    const sub = cls(screen.getByText("sub"));
    expect(sub).not.toContain("text-lg");
    expect(sub).toContain("text-xs");
  });

  it("the deprecated props are typed @deprecated in page-header.tsx", () => {
    expect(SOURCE).toMatch(/@deprecated[\s\S]{0,200}titleClassName\?: string/);
    expect(SOURCE).toMatch(/@deprecated[\s\S]{0,200}subtitleClassName\?: string/);
  });
});

describe("PageHeader v2: source hygiene", () => {
  it("page-header.tsx has no md:/lg:/sm:/xl:/2xl: breakpoint tokens", () => {
    const tokens = SOURCE.match(/(?<![\w-])(max-)?(sm|md|lg|xl|2xl):/g) ?? [];
    expect(tokens).toEqual([]);
  });

  it("page-header.tsx has no arbitrary text-[Npx] size", () => {
    expect(SOURCE).not.toMatch(/text-\[\d+(\.\d+)?px\]/);
  });

  it("desktopClasses is removed from the source", () => {
    expect(SOURCE).not.toContain("desktopClasses");
  });

  it("the overflow trigger (More) is shown at every size: it is the header group's first button", () => {
    expect(SOURCE).not.toContain('className="regular:hidden"');
  });
});
