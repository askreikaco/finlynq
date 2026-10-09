/**
 * @vitest-environment jsdom
 */
// Glass top bar on phones (PageHeader + settings detail row). CSS-level checks on globals.css and
// render checks on PageHeader: centred title, subtitle on phones, left spacer or back circle,
// one right capsule only when there are actions, primary action never see-through.
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";

const h = React.createElement;
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, cleanup, screen } from "@testing-library/react";
import { PageHeader } from "@/components/mobile/page-header";
import { Button } from "@/components/ui/button";

const css = readFileSync(resolve(__dirname, "../../src/app/globals.css"), "utf-8");
const pageHeaderSrc = readFileSync(resolve(__dirname, "../../src/components/mobile/page-header.tsx"), "utf-8");
const cls = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

afterEach(() => cleanup());

/** Body of the first `.glass-bar {` rule (base, not .dark) inside the phone block. */
function rule(selector: string): string {
  const i = css.indexOf(`\n  ${selector} {`);
  expect(i, `${selector} rule`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i));
}

/** Text of the block that starts at `marker` and runs to the next `}` closing that block at 2-space depth. */
function block(marker: string): string {
  const i = css.indexOf(marker);
  expect(i, marker).toBeGreaterThan(-1);
  const end = css.indexOf("\n  }\n", i);
  return css.slice(i, end);
}

describe("glass-bar material (globals.css, phones only)", () => {
  it("is scoped to max-width 48rem (below md) like the other glass", () => {
    expect(css.indexOf(".glass-bar {")).toBeGreaterThan(css.indexOf("@media (width < 48rem) {"));
  });

  it("has a translucent tint and backdrop blur with saturate, with the -webkit- prefix", () => {
    const body = rule(".glass-bar");
    expect(body).toMatch(/background:\s*oklch\(1 0 0 \/ 60%\)/);
    expect(body).toMatch(/-webkit-backdrop-filter:\s*blur\(28px\) saturate\(1\.8\)/);
    expect(body).toMatch(/\n\s+backdrop-filter:\s*blur\(28px\) saturate\(1\.8\)/);
  });

  it("has a 1px hairline bottom rim (black 8% light, white 10% dark)", () => {
    expect(rule(".glass-bar")).toMatch(/border-bottom:\s*1px solid oklch\(0 0 0 \/ 8%\)/);
    expect(rule(".dark .glass-bar")).toMatch(/border-bottom-color:\s*oklch\(1 0 0 \/ 10%\)/);
  });

  it("dark fallbacks exist in the @supports-not block (light and dark)", () => {
    const sup = block("@supports not ((backdrop-filter: blur(1px))");
    expect(sup).toContain(".glass-bar,\n    .dark .glass-bar {");
    expect(sup).toContain("background: var(--background);");
    expect(sup).toMatch(/\.glass-bar,\n {4}\.dark \.glass-bar \{[\s\S]*?backdrop-filter:\s*none;/);
  });

  it("dark fallbacks exist in the prefers-reduced-transparency block (light and dark)", () => {
    const rt = block("@media (prefers-reduced-transparency: reduce) {\n    .glass-bar");
    expect(rt).toContain(".glass-bar,\n    .dark .glass-bar {");
    expect(rt).toMatch(/\.glass-bar,\n {4}\.dark \.glass-bar \{[\s\S]*?backdrop-filter:\s*none;/);
  });

  it("uses tokens and oklch only (no raw palette colours, no color-mix)", () => {
    const i = css.indexOf(".glass-bar {");
    const seg = css.slice(i, css.indexOf("/* Mobile bottom tab bar", i));
    expect(seg).not.toMatch(/color-mix/);
    expect(seg).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|\b(white|black)\b/i);
  });
});

describe("PageHeader phone bar (render)", () => {
  it("renders the title in the middle grid column between the measured slots (no absolute overlay, pointer-events none)", () => {
    const { container } = render(h(PageHeader, { title: "Accounts" }));
    const h1 = screen.getByRole("heading", { level: 1, name: "Accounts" });
    const block = h1.parentElement as HTMLElement;
    expect(cls(block)).toEqual(expect.arrayContaining(["max-md:col-start-2", "max-md:row-start-1", "max-md:min-w-0", "max-md:text-center", "max-md:pointer-events-none"]));
    expect(cls(block)).not.toContain("max-md:absolute");
    expect(container.querySelector('[data-slot="page-header"]')).not.toBeNull();
  });

  it("shows the subtitle on phones as a muted second line", () => {
    render(h(PageHeader, { title: "Budgets", subtitle: "Set limits" }));
    const sub = screen.getByText("Set limits");
    expect(cls(sub)).toEqual(expect.arrayContaining(["block", "max-md:text-xs", "max-md:truncate"]));
    expect(cls(sub)).not.toContain("hidden");
  });

  it("left slot is an empty 44px spacer on top-level pages (title stays centred)", () => {
    const { container } = render(h(PageHeader, { title: "Dashboard" }));
    const spacer = container.querySelector('[data-slot="page-header-spacer"]');
    expect(spacer).not.toBeNull();
    expect(cls(spacer)).toEqual(expect.arrayContaining(["max-md:size-11", "hidden", "max-md:flex"]));
    expect(container.querySelector('[data-slot="back-button"]')).toBeNull();
  });

  it("left slot is a round 44px glass back button when backHref is set", () => {
    render(h(PageHeader, { title: "Currency Review", backHref: "/transactions", backLabel: "Back to Transactions" }));
    const back = screen.getByRole("link", { name: "Back to Transactions" });
    expect(cls(back)).toEqual(expect.arrayContaining(["glass-capsule", "max-md:size-11", "max-md:rounded-full"]));
  });

  it("right capsule exists only when the page has actions", () => {
    const { container, rerender } = render(h(PageHeader, { title: "Plain" }));
    expect(container.querySelector('[data-slot="page-header-actions"]')).toBeNull();
    rerender(h(PageHeader, { title: "Acts", actions: h("button", { type: "button", "aria-label": "Add" }, "+") }));
    const capsule = container.querySelector('[data-slot="page-header-actions"]');
    expect(capsule).not.toBeNull();
    expect(cls(capsule)).toEqual(expect.arrayContaining(["glass-capsule", "max-md:rounded-full", "max-md:h-11", "max-md:col-start-3"]));
  });

  it("the primary (default-variant) action keeps its own fill and sits inside the capsule, not see-through glass", () => {
    const { container } = render(h(PageHeader, { title: "Tx", actions: h(Button, { "aria-label": "Add transaction" }, "Add") }));
    const primary = screen.getByRole("button", { name: "Add transaction" });
    expect(primary.getAttribute("data-variant")).toBe("default");
    expect(primary.parentElement).toBe(container.querySelector('[data-slot="page-header-actions"]'));
    // the see-through reset is scoped to non-default buttons only
    expect(css).toContain('[data-slot="page-header-actions"] > :is(button, a):not([data-variant="default"]) {\n    background: transparent;');
  });

  it("no capsule or glass around the title (title block and h1 carry no glass classes)", () => {
    render(h(PageHeader, { title: "Plain", subtitle: "sub" }));
    const h1 = screen.getByRole("heading", { level: 1, name: "Plain" });
    expect(cls(h1)).not.toContain("glass-capsule");
    expect(cls(h1)).not.toContain("glass-bar");
    expect(cls(h1.parentElement)).not.toContain("glass-capsule");
  });

  it("the bar itself carries the glass-bar material and max-md sticky at the safe-area inset", () => {
    const { container } = render(h(PageHeader, { title: "Bar" }));
    const bar = container.querySelector('[data-slot="page-header"]');
    expect(cls(bar)).toEqual(expect.arrayContaining(["glass-bar", "sticky", "top-[var(--sat,0px)]", "z-30"]));
    expect(pageHeaderSrc).toContain("PHONE_BAR_TITLE");
  });
});
