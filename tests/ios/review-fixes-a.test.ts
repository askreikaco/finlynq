// @vitest-environment node
// Review fixes: header glass scoped to non-primary buttons, dark fallbacks, sticky ancestors,
// nav focus ring, chat height, page-fab observer debounce.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");
const button = read("src/components/ui/button.tsx");
const css = read("src/app/globals.css");
const layout = read("src/app/(app)/layout.tsx");
const nav = read("src/components/nav.tsx");
const chat = read("src/app/(app)/chat/page.tsx");
const pageFab = read("src/components/mobile/page-fab.tsx");

const GLASS_SEL = '[data-slot="page-header-actions"] > :is(button, a):not([data-variant="default"])';

// Text of the phone-only glass block (from its opening @media to the tab bar section).
function phoneGlassBlock(): string {
  const start = css.indexOf("@media (width < 48rem) {\n  .glass-capsule {");
  const end = css.indexOf("/* Mobile bottom tab bar", start);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, end);
}

// Body of the rule opened by `selector {` inside `source` (rules here have no nested braces).
function bodyOf(source: string, selector: string): string {
  const i = source.indexOf(selector + " {");
  expect(i).toBeGreaterThan(-1);
  return source.slice(i, source.indexOf("}", i));
}

describe("M1: header glass excludes primary-filled buttons", () => {
  it("Button emits its variant as data-variant", () => {
    expect(button).toContain("data-variant={variant}");
  });

  it("non-primary action children are bare on the capsule; the exclusion is on the rule", () => {
    const block = phoneGlassBlock();
    expect(block).toContain(`${GLASS_SEL} {\n    background: transparent;`);
    // Sizing/shape rule stays unscoped so primary CTAs become round 44px too.
    const sizing = bodyOf(block, '  [data-slot="page-header-actions"] > :is(button, a)');
    expect(sizing).toContain("border-radius: 9999px");
    expect(sizing).toContain("height: 2.75rem");
    expect(sizing).not.toContain("background");
  });

  it("primary-variant rules never set a background on header actions", () => {
    const block = phoneGlassBlock();
    // Every background declaration on header actions must be behind the exclusion.
    const lines = block.split("\n");
    lines.forEach((line, idx) => {
      if (!line.includes('[data-slot="page-header-actions"]')) return;
      if (line.includes(":is(button, a)") && !line.includes(":not([data-variant")) {
        // only the sizing rule may be unscoped
        const body = lines.slice(idx, idx + 4).join("\n");
        expect(body).not.toMatch(/background/);
      }
    });
  });
});

describe("m1: dark fallbacks in both no-backdrop blocks", () => {
  it("@supports not block covers dark glass-capsule and glass-bar", () => {
    const block = phoneGlassBlock();
    const at = block.indexOf("@supports not ((backdrop-filter");
    const mq = block.indexOf("@media (prefers-reduced-transparency: reduce)");
    expect(at).toBeGreaterThan(-1);
    expect(mq).toBeGreaterThan(at);
    const supports = block.slice(at, mq);
    expect(supports).toContain(".glass-bar,\n    .dark .glass-bar {");
    expect(supports).toContain(".glass-capsule,\n    .dark .glass-capsule {");
    expect(supports).toContain("-webkit-backdrop-filter: none;");
  });

  it("prefers-reduced-transparency block covers dark glass-capsule and glass-bar", () => {
    const block = phoneGlassBlock();
    const mq = block.indexOf("@media (prefers-reduced-transparency: reduce)");
    expect(mq).toBeGreaterThan(-1);
    const tail = block.slice(mq);
    expect(tail).toContain(".glass-bar,\n    .dark .glass-bar {");
    expect(tail).toContain(".glass-capsule,\n    .dark .glass-capsule {");
    expect(tail).toContain("backdrop-filter: none;");
  });
});

describe("S1: phone main does not become a scroll container", () => {
  it("layout main has max-md:overflow-y-visible and max-md:overflow-x-clip", () => {
    const m = layout.match(/<main className="([^"]+)"/);
    expect(m).not.toBeNull();
    const cls = m![1].split(/\s+/);
    expect(cls).toContain("max-md:overflow-y-visible");
    expect(cls).toContain("max-md:overflow-x-clip");
    // desktop keeps the original overflow classes
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("overflow-x-hidden");
  });
});

describe("m10: mobile bottom bar links have a focus ring", () => {
  it("both MobileBottomBar link classes include focus-visible ring on sidebar-ring", () => {
    const links = nav.split("\n").filter((l) => l.includes("rounded-full px-0.5 text-[11px]"));
    expect(links.length).toBe(2);
    for (const l of links) {
      expect(l).toContain("focus-visible:ring-2");
      expect(l).toContain("focus-visible:ring-sidebar-ring");
      expect(l).toContain("focus-visible:outline-none");
    }
  });

  it("sidebar-ring token exists in globals.css", () => {
    expect(css).toContain("--color-sidebar-ring: var(--sidebar-ring);");
  });
});

describe("m3: chat height uses the mobile bar clearance on phones", () => {
  it("phone height uses --mobile-bar-clearance, desktop height unchanged", () => {
    expect(chat).toContain("max-md:h-[calc(100dvh-var(--mobile-bar-clearance)-3.75rem)]");
    expect(chat).toContain("md:h-[calc(100dvh-4rem)]");
    expect(chat).toContain("max-md:-mb-20");
    expect(chat).not.toContain("h-[calc(100dvh-8.5rem)]");
  });
});

describe("m9: page-fab overlay observer is debounced with requestAnimationFrame", () => {
  it("MutationObserver callback schedules a frame and cancels it on cleanup", () => {
    expect(pageFab).toContain("requestAnimationFrame(");
    expect(pageFab).toContain("cancelAnimationFrame(frame)");
    expect(pageFab).toContain("new MutationObserver(schedule)");
    expect(pageFab).not.toContain("new MutationObserver(check)");
  });
});
