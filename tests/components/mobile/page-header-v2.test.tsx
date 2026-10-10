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
  PHONE_BAR_RIGHT,
  PHONE_CAPSULE,
  PHONE_BAR_TITLE,
  PHONE_BAR_SUBTITLE,
  HEADER_TITLE_CLASS,
  HEADER_SUBTITLE_CLASS,
} from "@/components/mobile/page-header";

afterEach(cleanup);
const cls = (el: Element) => el.className.toString().split(/\s+/);
const SOURCE = fs.readFileSync(path.join(process.cwd(), "src/components/mobile/page-header.tsx"), "utf-8");

describe("PageHeader v2: classes below and at regular", () => {
  it("the phone bar classes are max-regular (below 640px), never max-md", () => {
    expect(PHONE_BAR).toContain("max-regular:grid");
    expect(PHONE_BAR).toContain("max-regular:min-h-[var(--phone-header-h)]");
    expect(PHONE_BAR).toContain("max-regular:px-4");
    expect(PHONE_BAR).not.toMatch(/max-md:/);
    expect(PHONE_CAPSULE).toContain("max-regular:max-w-[11rem]");
    expect(PHONE_BAR_TITLE).toContain("max-regular:text-base");
    expect(PHONE_BAR_SUBTITLE).toContain("max-regular:text-xs");
  });

  it("the regular layer is opaque (no glass) and the bar is sticky at every size", () => {
    expect(PHONE_BAR_STICKY.split(/\s+/)).toContain("regular:top-0");
    expect(PHONE_BAR_STICKY).toContain("regular:bg-background/90");
    expect(PHONE_BAR_STICKY).toContain("regular:backdrop-blur-sm");
    expect(PHONE_BAR_STICKY).toContain("sticky");
    expect(PHONE_BAR_STICKY.split(/\s+/)).not.toContain("max-regular:sticky");
      });

  it("title is text-3xl/9 extrabold from regular up; subtitle is text-sm from regular up", () => {
    expect(HEADER_TITLE_CLASS).toBe("text-3xl/9 font-extrabold tracking-tight");
    expect(HEADER_SUBTITLE_CLASS).toContain("text-sm");
    expect(HEADER_SUBTITLE_CLASS).toContain("block");
  });

  it("the rendered title block and h1 carry both layers", () => {
    render(<PageHeader title="Dashboard" subtitle="Today" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(cls(h1)).toEqual(expect.arrayContaining(["text-3xl/9", "font-extrabold", "max-regular:text-base"]));
    const sub = screen.getByText("Today");
    expect(cls(sub)).toEqual(expect.arrayContaining(["text-sm", "max-regular:text-xs"]));
  });
});

describe("PageHeader v2: secondary actions", () => {
  it("HEADER_SECONDARY is hidden below regular and only that (no max-md, no display override)", () => {
    expect(HEADER_SECONDARY).toBe("max-regular:hidden");
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
    expect(cls(screen.getByText("Export", { selector: "button" }))).toContain("max-regular:hidden");
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
    expect(sub).toContain("text-sm");
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

  it("the overflow trigger is hidden from regular up (only the phone menu)", () => {
    expect(SOURCE).toContain('className="regular:hidden"');
  });
});
