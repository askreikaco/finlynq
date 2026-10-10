// @vitest-environment node
// Floating iOS 26 liquid-glass mobile tab bar (nav.tsx MobileBottomBar, globals.css).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { resolvedDecls } from "../helpers/css-tokens";

const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");
const nav = read("src/components/nav.tsx");
const css = read("src/app/globals.css");
const layout = read("src/app/(app)/layout.tsx");

// Extract the body of the first rule matching `selector {` (no nested braces in these rules).
function ruleBody(source: string, selector: string): string {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}");
  const m = source.match(re);
  if (!m) throw new Error(`rule not found: ${selector}`);
  return m[1];
}

const barNavClass = (() => {
  const m = nav.match(/<nav aria-label="Mobile navigation" className="([^"]+)"/);
  if (!m) throw new Error("mobile nav not found");
  return m[1];
})();

describe("floating capsule geometry (nav.tsx)", () => {
  it("is fixed, z-50, mobile only, with 16px side insets plus safe-area", () => {
    expect(barNavClass).toContain("regular:hidden");
    expect(barNavClass).not.toContain("md:hidden");
    expect(barNavClass).toContain("fixed");
    expect(barNavClass).toContain("z-50");
    expect(barNavClass).toContain("left-[calc(16px+var(--sal))]");
    expect(barNavClass).toContain("right-[calc(16px+var(--sar))]");
  });

  it("sits above the home indicator with bottom = max(12px, --sab)", () => {
    expect(barNavClass).toContain("bottom-[max(12px,var(--sab))]");
  });

  it("is a rounded-[28px] capsule about 64px tall (h-16)", () => {
    expect(barNavClass).toContain("rounded-[28px]");
    expect(barNavClass).toContain("h-16");
  });

  it("keeps the mobile-glass-bar hook and drops the old flat full-width strip classes", () => {
    expect(barNavClass).toContain("mobile-glass-bar");
    expect(barNavClass).not.toContain("bg-sidebar/80");
    expect(barNavClass).not.toContain("backdrop-blur");
    expect(barNavClass).not.toContain("border-t");
    expect(barNavClass).not.toContain("bottom-0");
  });
});

describe("glass material (globals.css)", () => {
  it("light fill is oklch(1 0 0 / 80%): raised from 55% so content behind the labels does not read through", () => {
    expect(resolvedDecls(css, ".mobile-glass-bar", "light")).toMatch(/background:\s*oklch\(1 0 0 \/ 80%\)/);
  });

  it("blur uses both -webkit- and standard backdrop-filter with blur(32px) saturate(1.8)", () => {
    const body = resolvedDecls(css, ".mobile-glass-bar", "light");
    expect(body).toMatch(/-webkit-backdrop-filter:\s*blur\(32px\) saturate\(1\.8\)/);
    expect(body).toMatch(/(?<!-webkit-)backdrop-filter:\s*blur\(32px\) saturate\(1\.8\)/);
  });

  it("light rim is 1px oklch(0 0 0 / 8%)", () => {
    expect(resolvedDecls(css, ".mobile-glass-bar", "light")).toMatch(/border:\s*1px solid oklch\(0 0 0 \/ 8%\)/);
  });

  it("has the shared liquid edge light (top and bottom) and a soft drop shadow", () => {
    const body = resolvedDecls(css, ".mobile-glass-bar", "light");
    expect(body).toContain("inset 0 1px 0 oklch(1 0 0 / 70%)");
    expect(body).toContain("inset 0 -1px 0 oklch(1 0 0 / 30%)");
    expect(body).toContain("0 8px 32px oklch(0 0 0 / 35%)");
  });

  it("dark mode: fill oklch(0.16 0.008 245 / 78%) and rim oklch(1 0 0 / 14%)", () => {
    const body = resolvedDecls(css, ".mobile-glass-bar", "dark");
    expect(body).toMatch(/background:\s*oklch\(0\.16 0\.008 245 \/ 78%\)/);
    expect(body).toMatch(/border:\s*1px solid oklch\(1 0 0 \/ 14%\)/);
  });

  it("active pill: dark oklch(1 0 0 / 12%), light oklch(0 0 0 / 7%)", () => {
    expect(ruleBody(css, ".mobile-glass-pill")).toMatch(/background:\s*oklch\(0 0 0 \/ 7%\)/);
    expect(ruleBody(css, ".dark .mobile-glass-pill")).toMatch(/background:\s*oklch\(1 0 0 \/ 12%\)/);
  });

  it("glass uses no color-mix (tokens and oklch only)", () => {
    const start = css.indexOf("/* Mobile bottom tab bar: floating");
    const end = css.indexOf("/* Mobile bar fallbacks");
    expect(start).toBeGreaterThan(-1);
    expect(css.slice(start, end)).not.toContain("color-mix");
  });
});

describe("fallbacks and motion", () => {
  it("opaque sidebar fallback when backdrop-filter is unsupported (light and dark)", () => {
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\)[^{]*\{\s*\.mobile-glass-bar\s*\{\s*background-color:\s*var\(--sidebar\);?\s*\}\s*\.dark \.mobile-glass-bar\s*\{\s*background-color:\s*var\(--sidebar\);?\s*\}/);
  });

  it("opaque sidebar fallback when color-mix is unsupported (light and dark)", () => {
    expect(css).toMatch(/@supports not \(color: color-mix\(in oklab, red, blue\)\)\s*\{\s*\.mobile-glass-bar\s*\{\s*background-color:\s*var\(--sidebar\);?\s*\}\s*\.dark \.mobile-glass-bar\s*\{\s*background-color:\s*var\(--sidebar\);?\s*\}/);
  });

  it("prefers-reduced-transparency drops blur and uses the opaque fill (light and dark)", () => {
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*\{\s*\.mobile-glass-bar\s*\{[^}]*backdrop-filter:\s*none[^}]*\}\s*\.dark \.mobile-glass-bar\s*\{\s*background-color:\s*var\(--sidebar\)/);
  });

  it("prefers-reduced-motion disables transitions and animations on the bar", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.mobile-glass-bar, \.mobile-glass-bar \*\s*\{[^}]*transition:\s*none !important[^}]*animation:\s*none !important/);
  });
});

describe("tabs and active state (nav.tsx)", () => {
  it("active tab gets the glass pill and text-tab-active; inactive uses text-tab-inactive (tokens, contrast-checked)", () => {
    expect(nav).toContain('"mobile-glass-pill text-tab-active"');
    expect(nav).toContain('"text-tab-inactive"');
    expect(nav).not.toContain("text-sidebar-foreground/50\"");
  });

  it("tabs keep aria-current and a 44px minimum touch height", () => {
    // One shared bar tab literal for all five tabs (registry tabs + More); the rail has its own literal (min-h-14).
    const tabBlocks = nav.match(/min-h-11/g) ?? [];
    expect(tabBlocks.length).toBe(1);
    expect(nav).toContain('aria-current={isActive ? "page" : undefined}');
    expect(nav).toContain("min-h-14");
  });

  it("row keeps data-testid mobile-bar-row and fills the capsule", () => {
    expect(nav).toContain('className="flex h-full items-stretch justify-around p-1.5" data-testid="mobile-bar-row"');
  });
});

describe("clearance above the bar", () => {
  it("defines --mobile-bar-clearance on :root as 96px + --sab", () => {
    expect(css).toMatch(/:root\s*\{[^}]*--mobile-bar-clearance:\s*calc\(96px \+ var\(--sab\)\)/);
  });

  it("app shell content padding uses the clearance var (with PageFab +80px)", () => {
    expect(layout).toContain("pb-[calc(var(--mobile-bar-clearance)+80px)] regular:pb-0");
    expect(layout).not.toContain("132px");
    expect(layout).not.toContain("60px+var(--sab)");
  });

  it("floating UI above the bar uses the clearance var, not the old fixed heights", () => {
    for (const p of [
      "src/components/announcement-banner.tsx",
      "src/components/inbox/lens-toast.tsx",
      "src/components/reconcile/bulk-link-action-bar.tsx",
      "src/components/account-switcher.tsx",
    ]) {
      const src = read(p);
      expect(src, p).toContain("var(--mobile-bar-clearance)");
      expect(src, p).not.toMatch(/bottom-(20|\[calc\(76px|\[calc\(80px)/);
    }
  });
});
