/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { PageHeader } from "@/components/mobile";

afterEach(cleanup);

/** Owner 2026-10-14: the top bar never shows a subtitle/description line; page help is the (i) InfoTip. */
describe("PageHeader: no subtitle line, help goes through InfoTip", () => {
  it("renders no subtitle element for `info`, and no help text in the DOM until the tip opens", () => {
    const { container } = render(<PageHeader title="Goals" info="New help text" />);
    expect(container.querySelector("[data-slot=page-header-subtitle]")).toBeNull();
    expect(container.textContent).not.toMatch(/help text/);
    expect(container.querySelectorAll("[data-slot=info-tip]")).toHaveLength(1);
  });

  it("the (i) button is a labelled, focusable button placed right after the title inside the title block", () => {
    const { container } = render(<PageHeader title="Goals" info="Track targets" />);
    const tip = screen.getByRole("button", { name: "About Goals" });
    expect(tip.getAttribute("data-slot")).toBe("info-tip");
    expect(tip.tabIndex).not.toBe(-1);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.nextElementSibling).toBe(tip);
    expect(container.querySelector("[data-slot=page-header-title-block]")!.contains(tip)).toBe(true);
  });

  it("opens on click and shows the text in the tooltip; Esc closes it", async () => {
    render(<PageHeader title="Goals" info="Track targets" />);
    fireEvent.click(screen.getByRole("button", { name: "About Goals" }));
    expect(await screen.findByText("Track targets")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByText("Track targets")).toBeNull());
  });

  it("without info there is no (i) button", () => {
    const { container } = render(<PageHeader title="Goals" />);
    expect(container.querySelector("[data-slot=info-tip]")).toBeNull();
  });

  it("source guard: page-header.tsx has no visible subtitle slot", () => {
    const src = readFileSync(resolve(__dirname, "../../../src/components/mobile/page-header.tsx"), "utf8");
    expect(src).not.toMatch(/data-slot="page-header-subtitle"/);
    expect(src).not.toMatch(/PHONE_BAR_SUBTITLE/);
  });

  it("call sites: no page template / PageHeader in src/app or src/components passes the deprecated `subtitle` prop", () => {
    const { readdirSync, statSync } = require("fs") as typeof import("fs");
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = resolve(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".tsx") && !p.includes("/dev/")) {
          const src = readFileSync(p, "utf8");
          if (/<(PageHeader|SectionPage|ListPage|FormPage|ReportPage)\b[^>]*\bsubtitle=/.test(src)) bad.push(p);
        }
      }
    };
    walk(resolve(__dirname, "../../../src/app"));
    walk(resolve(__dirname, "../../../src/components"));
    expect(bad).toEqual([]);
  });
});
