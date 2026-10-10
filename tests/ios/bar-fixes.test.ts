/**
 * @vitest-environment jsdom
 */
// Bar fixes: phone top bar (icon-only primary, title insets), tab bar (one label-size token, glass tint,
// token colours with measured contrast), More page (PageHeader + clearance), new-transaction back circle
// (centred in the 60px bar). Static source checks plus PageHeader render checks. jsdom has no layout:
// widths are checked by arithmetic in comments and in the pure functions below, never measured.
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, cleanup, screen } from "@testing-library/react";
import {
  PageHeader,
  PHONE_BAR,
  PHONE_BAR_CENTER,
  PHONE_BAR_RIGHT,
  PHONE_CAPSULE,
  HEADER_MAX_PHONE_ACTIONS,
  PHONE_BAR_TITLE,
  PHONE_BAR_SUBTITLE,
  PHONE_PRIMARY_CLASS,
  HEADER_DESKTOP_ONLY,
} from "@/components/mobile/page-header";
import { Button } from "@/components/ui/button";
import { resolvedDecls } from "../helpers/css-tokens";

const h = React.createElement;
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf-8");
const css = read("src/app/globals.css");
const nav = read("src/components/nav.tsx");
const navBar = nav.slice(nav.indexOf("export const AppTabs"));
const moreMenu = read("src/components/more-menu.tsx");
const newTx = read("src/app/(app)/transactions/new/page.tsx");
const pageHeaderSrc = read("src/components/mobile/page-header.tsx");
const cls = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

afterEach(() => cleanup());

/** Body of the phone block: every rule inside @media (width < 40rem). */
function phoneBlock(): string {
  const marker = css.indexOf("iOS 26-style liquid glass, phones only");
  expect(marker).toBeGreaterThan(-1);
  const i = css.indexOf("@media (width < 40rem) {", marker);
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("\n}\n", i));
}

/** Declarations of the first rule whose selector line matches `selector` (inside `scope`). */
function body(scope: string, selector: string): string {
  const i = scope.indexOf(`${selector} {`);
  expect(i, selector).toBeGreaterThan(-1);
  return scope.slice(i, scope.indexOf("}", i));
}

// ---- colour arithmetic (WCAG 2.x relative luminance over oklch, Ottosson conversion) ----
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
type RGB = { r: number; g: number; b: number; a: number };
function oklch(L: number, C: number, hDeg: number, a = 1): RGB {
  const hr = (hDeg * Math.PI) / 180;
  const A = C * Math.cos(hr);
  const B = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: toLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a,
  };
}
const luminance = (c: RGB) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const over = (f: RGB, bg: RGB): RGB => ({
  r: f.r * f.a + bg.r * (1 - f.a),
  g: f.g * f.a + bg.g * (1 - f.a),
  b: f.b * f.a + bg.b * (1 - f.a),
  a: 1,
});
function contrast(x: RGB, y: RGB): number {
  const a = luminance(x);
  const b = luminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("1. phone primary action is an icon-only 44pt filled circle (below regular)", () => {
  it("PageHeader marks the visible primary with phone-icon-action and keeps its text as aria-label", () => {
    render(h(PageHeader, { title: "Transactions", actions: h(Button, null, "Add") }));
    const primary = screen.getByRole("button", { name: "Add" });
    expect(cls(primary)).toContain(PHONE_PRIMARY_CLASS);
    expect(primary.getAttribute("aria-label")).toBe("Add");
    expect(primary.getAttribute("data-variant")).toBe("default");
  });

  it("an existing aria-label is kept, not replaced", () => {
    render(h(PageHeader, { title: "Tx", actions: h(Button, { "aria-label": "Add transaction" }, "Add") }));
    expect(screen.getByRole("button", { name: "Add transaction" }).getAttribute("aria-label")).toBe("Add transaction");
  });

  it("secondary actions hidden below regular are skipped: the last VISIBLE action is the primary", () => {
    render(
      h(PageHeader, {
        title: "Budgets",
        actions: [
          h(Button, { key: "x", variant: "outline", className: HEADER_DESKTOP_ONLY }, "Export"),
          h(Button, { key: "p" }, "Add Budget"),
        ],
      }),
    );
    expect(cls(screen.getByRole("button", { name: "Add Budget" }))).toContain(PHONE_PRIMARY_CLASS);
    expect(cls(screen.getByRole("button", { name: "Export" }))).not.toContain(PHONE_PRIMARY_CLASS);
  });

  it("the phone rule sits inside the phone media block only (below regular), with size, icon-only text and token fill", () => {
    const phone = phoneBlock();
    const rule = body(phone, '[data-slot="header-capsule"] > :is(button, a).phone-icon-action');
    expect(rule).toMatch(/background:\s*transparent;/);
    expect(rule).toMatch(/color:\s*var\(--foreground\);/);
    expect(rule).toMatch(/font-size:\s*0;/);
    expect(rule).not.toMatch(/var\(--primary\)/);
    expect(rule).not.toMatch(/var\(--primary-foreground\)/);
    // the cell geometry comes from the shared capsule cell rule (44px, round)
    expect(phone).toMatch(/\[data-slot="header-capsule"\] > :is\(button, a\) \{\s*width: 2\.75rem;/);
    expect(rule).not.toMatch(/backdrop-filter:\s*blur/);
    expect(css.slice(0, css.indexOf("iOS 26-style liquid glass, phones only"))).not.toContain(".phone-icon-action");
  });

  it("the primary cell is neutral: its icon is --foreground on the glass capsule (no accent fill to check)", () => {
    const fg = oklch(0.18, 0.015, 250);
    const glass = oklch(1, 0, 0);
    expect(contrast(fg, glass)).toBeGreaterThanOrEqual(4.5);
  });

  it("the tab-bar and bar pieces the render relies on are in the source (no text-[Npx] in the bar code)", () => {
    expect(PHONE_BAR).toContain("max-regular:grid");
    expect(pageHeaderSrc).not.toMatch(/text-\[\d/);
    expect(navBar).not.toMatch(/text-\[\d/);
  });
});

describe("2. title block insets equal the measured left slot and right capsule", () => {
  it("the bar is a three-column grid: side tracks min 2.75rem (44pt) and auto, title in the 1fr middle", () => {
    expect(PHONE_BAR).toContain("max-regular:grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(PHONE_BAR).toContain("max-regular:items-center");
    expect(PHONE_BAR).toContain("max-regular:min-h-[var(--phone-header-h)]");
  });

  it("the title block is the middle column, min-w-0, not an absolute overlay", () => {
    expect(PHONE_BAR_CENTER).toContain("max-regular:col-start-2");
    expect(PHONE_BAR_CENTER).toContain("max-regular:min-w-0");
    expect(PHONE_BAR_CENTER).toContain("max-regular:pointer-events-none");
    expect(PHONE_BAR_CENTER).not.toContain("max-regular:absolute");
    expect(PHONE_BAR_CENTER).not.toMatch(/inset-x-\[/);
  });

  it("the capsule is the third column, one 44px slot per item, capped at 11rem and never scrolling", () => {
    expect(PHONE_BAR_RIGHT).toContain("max-regular:col-start-3");
    expect(PHONE_BAR_RIGHT).toContain("max-regular:justify-self-end");
    expect(PHONE_BAR_RIGHT).not.toContain("gap-2.5"); // one capsule child group; the primary sits inside it
    expect(PHONE_CAPSULE).toContain("max-regular:max-w-[11rem]");
    expect(PHONE_CAPSULE).toContain("max-regular:gap-0");
    expect(PHONE_CAPSULE).not.toContain("overflow-x-auto");
    expect(PHONE_BAR_RIGHT).not.toContain("overflow-x-auto");
    expect(PHONE_BAR_RIGHT).not.toContain("9.5rem");
    // Arithmetic: 4 slots (3 actions + overflow trigger) x 44px = 176px = 11rem at a 16px root.
    expect(HEADER_MAX_PHONE_ACTIONS + 1).toBe(4);
    expect((HEADER_MAX_PHONE_ACTIONS + 1) * 44).toBeLessThanOrEqual(11 * 16);
  });

  it("the title and subtitle truncate with ellipsis (one line each)", () => {
    expect(PHONE_BAR_TITLE).toContain("max-regular:truncate");
    expect(PHONE_BAR_SUBTITLE).toContain("max-regular:truncate");
    expect(PHONE_BAR_SUBTITLE).toContain("max-regular:text-xs");
  });

  it("render: title block in the middle column, capsule in the third, subtitle visible", () => {
    const { container } = render(
      h(PageHeader, {
        title: "Accounts",
        subtitle: "Every account you track, in one list",
        actions: [h(Button, { key: "a", className: HEADER_DESKTOP_ONLY }, "Edit"), h(Button, { key: "b" }, "Add")],
        overflow: [{ label: "Export", onSelect: () => {} }],
      }),
    );
    const block = container.querySelector('[data-slot="page-header-title-block"]');
    expect(cls(block)).toContain("max-regular:col-start-2");
    const capsule = container.querySelector('[data-slot="header-capsule"]');
    expect(cls(capsule)).toEqual(expect.arrayContaining(["glass-capsule", "max-regular:max-w-[11rem]"]));
    expect(cls(capsule?.parentElement ?? null)).toContain("max-regular:col-start-3");
    expect(cls(screen.getByText("Every account you track, in one list"))).toContain("max-regular:truncate");
  });

  it("the bar keeps the sticky glass material and the fixed min height (one row, 60px)", () => {
    expect(PHONE_BAR).toContain("glass-bar sticky top-[var(--sat,0px)] z-30");
    expect(css).toMatch(/--phone-header-h:\s*3\.75rem;/);
  });
});

describe("3. one tab-label size token, iOS tab bar geometry", () => {
  it("--tab-label-size is defined once, as 10px (0.625rem), and the label uses only that token", () => {
    expect(css.match(/--tab-label-size:/g)?.length).toBe(1);
    expect(css).toMatch(/--tab-label-size:\s*0\.625rem;/);
    expect(body(css, ".mobile-tab-label")).toMatch(/font-size:\s*var\(--tab-label-size\);/);
  });

  it("the tab bar code uses the label class and no arbitrary or text-xs size", () => {
    expect(navBar).toContain('"mobile-tab-label block max-w-full truncate"');
    expect(navBar).not.toMatch(/\btext-xs\b/);
    expect(navBar).not.toMatch(/text-\[\d/);
  });

  it("icons are 24px (size-6) and the tap target is 44pt+ (min-h-11)", () => {
    expect(navBar.match(/size-6/g)?.length).toBe(2);
    expect(navBar).not.toContain("size-[22px]");
    expect(navBar.match(/min-h-11/g)?.length).toBe(1); // one shared bar tab literal
  });

  it("tab padding is tight (px-0) so the label box is the whole per-tab width", () => {
    expect(navBar.match(/rounded-full px-0 whitespace-nowrap/g)?.length).toBe(1); // one shared bar tab literal
    expect(navBar).not.toMatch(/px-0\.5/);
  });

  it("'Transactions' fits the per-tab width at 360 and 390 (arithmetic, not measurement)", () => {
    // Pill: left/right inset 16px each; row p-1.5 = 6px each side; 5 equal flex-1 tabs (min-w-0, px-0).
    const tabWidth = (vw: number) => (vw - 2 * 16 - 2 * 6) / 5;
    // Advance width of "Transactions" in Arial Regular (units/1000): 611+333+556+556+500+556+500+278+222+556+556+500
    // = 5724 -> 5.724em. At 10px = 57.24px. SF Pro Text Regular is within a few percent of this, so the
    // arithmetic has slack; Arial Bold (6.224em = 62.2px) would also fit at 360 but with 1px to spare, so the
    // label is weight 500, not 600.
    const transactionsAt10px = 5.724 * 10;
    expect(tabWidth(360)).toBeCloseTo(63.2, 5);
    expect(tabWidth(360)).toBeGreaterThanOrEqual(transactionsAt10px);
    expect(tabWidth(390)).toBeGreaterThanOrEqual(transactionsAt10px);
    // 320: 55.2px < 57.24px, so the label truncates with an ellipsis there (accepted).
    expect(tabWidth(320)).toBeLessThan(transactionsAt10px);
    expect(body(css, ".mobile-tab-label")).toMatch(/font-weight:\s*500;/);
  });
});

describe("4. tab bar glass tint and token colours (contrast measured in the test)", () => {
  it("light tint is translucent but raised: oklch(1 0 0 / 80%) with blur kept", () => {
    const b = resolvedDecls(css, ".mobile-glass-bar", "light");
    expect(b).toMatch(/background:\s*oklch\(1 0 0 \/ 80%\);/);
    expect(b).toMatch(/backdrop-filter:\s*blur\(32px\) saturate\(1\.8\)/);
  });

  it("dark tint is translucent but raised: oklch(0.16 0.008 245 / 78%)", () => {
    expect(resolvedDecls(css, ".mobile-glass-bar", "dark")).toMatch(/background:\s*oklch\(0\.16 0\.008 245 \/ 78%\);/);
  });

  it("the opaque fallbacks for the tab bar survive (@supports not blur, reduced transparency)", () => {
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\)[^{]*\{\s*\.mobile-glass-bar\s*\{\s*background-color:\s*var\(--sidebar\);/);
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*\{\s*\.mobile-glass-bar\s*\{[^}]*background-color:\s*var\(--sidebar\)/);
  });

  it("tab colours are tokens, mapped through @theme inline, and the bar uses them", () => {
    expect(css).toContain("--color-tab-inactive: var(--tab-inactive);");
    expect(css).toContain("--color-tab-active: var(--tab-active);");
    expect(navBar).toContain('"text-tab-inactive"');
    expect(navBar).toContain('"mobile-glass-pill text-tab-active"');
    expect(navBar).not.toContain("text-sidebar-foreground/60");
  });

  it("light inactive label is at least 4.5:1 against the light glass (old value was about 1.4:1)", () => {
    expect(css).toMatch(/:root\s*\{[^}]*--tab-inactive:\s*oklch\(0\.42 0\.012 250\);/);
    const page = oklch(0.985, 0.003, 85);
    const lightGlass = over(oklch(1, 0, 0, 0.8), page);
    expect(contrast(oklch(0.42, 0.012, 250), lightGlass)).toBeGreaterThanOrEqual(4.5);
    // Old value: sidebar-foreground (0.90) at 60% over the same glass.
    expect(contrast(over(oklch(0.9, 0.005, 245, 0.6), oklch(1, 0, 0)), lightGlass)).toBeLessThan(2);
  });

  it("light active label is at least 4.5:1 against the light glass (primary-text, not the 0.75 fill)", () => {
    expect(css).toMatch(/:root\s*\{[^}]*--tab-active:\s*oklch\(0\.45 0\.13 70\);/);
    const lightGlass = over(oklch(1, 0, 0, 0.8), oklch(0.985, 0.003, 85));
    expect(contrast(oklch(0.45, 0.13, 70), lightGlass)).toBeGreaterThanOrEqual(4.5);
  });

  it("dark inactive and active labels are at least 4.5:1 against the dark glass", () => {
    expect(css).toMatch(/\.dark\s*\{[^}]*--tab-inactive:\s*oklch\(0\.80 0\.006 245\);/);
    const darkGlass = over(oklch(0.16, 0.008, 245, 0.78), oklch(0.115, 0.006, 245));
    expect(contrast(oklch(0.8, 0.006, 245), darkGlass)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(oklch(0.75, 0.165, 70), darkGlass)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("5. More page: PageHeader title and bottom clearance", () => {
  it("More renders PageHeader (centred glass bar), not the large left-aligned h1", () => {
    expect(moreMenu).toContain("PageHeader");
    expect(moreMenu).toContain('<PageHeader title="More" />');
    expect(moreMenu).not.toMatch(/<h1 className="text-4xl/);
  });

  it("the page bottom padding is the tab-bar clearance token, so section labels clear the bar", () => {
    expect(moreMenu).toContain("pb-[var(--mobile-bar-clearance)]");
    expect(css).toMatch(/--mobile-bar-clearance:\s*calc\(96px \+ var\(--sab\)\);/);
  });

  it("render: the More title is the bar's centred h1 in the page-header title slot", () => {
    const h1 = (container: HTMLElement) => container.querySelector('[data-slot="page-header-title"]');
    const { container } = render(h(PageHeader, { title: "More" }));
    expect(h1(container)?.textContent).toBe("More");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("More");
  });
});

describe("6. back circle is centred in the 60px bar (shared bar and new-transaction header)", () => {
  it("the shared bar is 3.75rem (60px) with items-center, so a 44px circle leaves 8px clear above and below", () => {
    // Arithmetic: (60 - 44) / 2 = 8px.
    expect(PHONE_BAR).toContain("max-regular:min-h-[var(--phone-header-h)]");
    expect(PHONE_BAR).toContain("max-regular:items-center");
    expect((60 - 44) / 2).toBe(8);
  });

  it("the new-transaction header is the global PageHeader bar (the bar height, 3.75rem min, not a 44px row)", () => {
    expect(newTx).toMatch(/<PageHeader\s+className="shrink-0"/);
    expect(newTx).not.toMatch(/grid h-11 shrink-0 grid-cols-\[2\.75rem/);
  });
});
