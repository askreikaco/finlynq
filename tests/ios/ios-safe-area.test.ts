import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const css = read("src/app/globals.css");
const search = read("src/app/(app)/transactions/search/page.tsx");
const newTx = read("src/app/(app)/transactions/new/page.tsx");
const banner = read("src/components/announcement-banner.tsx");
const toast = read("src/components/inbox/lens-toast.tsx");
const bulk = read("src/components/reconcile/bulk-link-action-bar.tsx");
const switcher = read("src/components/account-switcher.tsx");

describe("iOS dvh min-height", () => {
  it("min-h-screen has vh fallback then dvh", () => {
    const vh = css.indexOf("min-height: calc(100vh - var(--sat));");
    const dvh = css.indexOf("min-height: calc(100dvh - var(--sat));");
    expect(vh).toBeGreaterThan(-1);
    expect(dvh).toBeGreaterThan(vh);
  });
  it("search loading view uses h-dvh, not h-screen", () => {
    expect(search).toContain("justify-center h-dvh");
    expect(search).not.toMatch(/(^|[\s"'])h-screen/);
  });
});

describe("safe-area offsets", () => {
  it("search sticky footer uses pb-[var(--sab)] and no dead safe-area class", () => {
    expect(search).toContain("pb-[var(--sab)]");
    expect(search).not.toContain("safe-area-inset-bottom");
  });
  it("new transaction header reserves top safe area", () => {
    expect(newTx).toContain("pt-[var(--sat)]");
  });
  it("bottom-fixed toasts and bars clear the floating tab bar (--mobile-bar-clearance)", () => {
    for (const src of [banner, toast, bulk]) {
      expect(src).toContain("bottom-[calc(var(--mobile-bar-clearance)-8px)]");
      expect(src).not.toMatch(/(^|\s)bottom-20(\s|")/);
    }
  });
  it("account switcher (fixed) clears the home indicator", () => {
    expect(switcher).toContain("fixed bottom-[calc(var(--mobile-bar-clearance)-8px)] md:bottom-4 left-4");
    expect(switcher).not.toContain("fixed bottom-4 ");
  });
});

describe("tap highlight and overscroll", () => {
  it("html disables tap highlight", () => {
    expect(css).toMatch(/html\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent;/);
  });
  it("body disables vertical overscroll", () => {
    expect(css).toMatch(/body\s*\{[^}]*overscroll-behavior-y:\s*none;/);
  });
  it("body keeps its safe-area padding-top", () => {
    expect(css).toMatch(/body\s*\{[^}]*padding-top:\s*var\(--sat\)/);
  });
});
