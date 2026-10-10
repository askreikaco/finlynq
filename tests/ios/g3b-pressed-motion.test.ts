// @vitest-environment node
// G3B: pressed feedback (button, list rows), global reduced-motion block, prod-only service worker, manifest icon entries.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");
const button = read("src/components/ui/button.tsx");
const listRow = read("src/components/mobile/list-row.tsx");
const txList = read("src/components/transactions/mobile-tx-list.tsx");
const css = read("src/app/globals.css");
const pwa = read("src/components/pwa-register.tsx");
const manifestSrc = read("src/app/manifest.ts");

describe("pressed feedback (button.tsx)", () => {
  it("base variant has an active: state with motion-safe transform", () => {
    expect(button).toContain("motion-safe:active:translate-y-px");
    expect(button).toContain("active:opacity-90");
  });

  it("default, outline, ghost, secondary and destructive variants define an active: background", () => {
    expect(button).toMatch(/default:\s*"[^"]*active:bg-primary\/80/);
    expect(button).toMatch(/"border-border bg-background hover:bg-muted hover:text-foreground active:bg-muted/);
    expect(button).toMatch(/ghost:\s*\n\s*"hover:bg-muted hover:text-foreground active:bg-muted/);
    expect(button).toMatch(/"bg-destructive\/10 text-destructive hover:bg-destructive\/20 active:bg-destructive\/25/);
  });

  it("does not change data-variant or data-size attributes", () => {
    expect(button).toContain("data-variant={variant}");
    expect(button).toContain("data-size={size}");
  });
});

describe("list rows keep hover and add pressed state", () => {
  it("mobile/list-row.tsx interactive rows have active:bg-muted/60 and hover:bg-muted/50", () => {
    expect(listRow).toContain("hover:bg-muted/50 active:bg-muted/60");
  });

  it("transactions/mobile-tx-list.tsx rows have active:bg-muted/60 and hover:bg-muted/50", () => {
    expect(txList).toContain("hover:bg-muted/50 active:bg-muted/60");
  });
});

describe("global reduced-motion (globals.css)", () => {
  it("keeps the existing mobile-glass-bar block untouched", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.mobile-glass-bar, \.mobile-glass-bar \*\s*\{[^}]*transition:\s*none !important[^}]*animation:\s*none !important/);
  });

  it("has a global block with near-zero durations and scroll-behavior auto", () => {
    const m = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after\s*\{([^}]*)\}/);
    expect(m, "global reduced-motion block").toBeTruthy();
    const body = m![1];
    expect(body).toContain("animation-duration: .01ms !important");
    expect(body).toContain("animation-iteration-count: 1 !important");
    expect(body).toContain("transition-duration: .01ms !important");
    expect(body).toContain("scroll-behavior: auto !important");
  });

  it("exempts spinners (animate-spin keeps a visible duration and infinite loop)", () => {
    expect(css).toMatch(/\[class\*="animate-spin"\]\s*\{[^}]*animation-duration:\s*1s !important[^}]*animation-iteration-count:\s*infinite !important/);
  });

  it("holds the shimmer skeleton as a static background", () => {
    expect(css).toMatch(/\.animate-shimmer, \.dark \.animate-shimmer \{ animation: none !important; \}/);
  });
});

describe("service worker registration (pwa-register.tsx)", () => {
  it("is gated to production before any registration attempt", () => {
    const gate = pwa.indexOf('process.env.NODE_ENV !== "production"');
    // The component binds `const container = navigator.serviceWorker` and registers via `container.register("/sw.js"`.
    expect(pwa).toMatch(/const container = navigator\.serviceWorker;/);
    const register = pwa.indexOf('container.register("/sw.js"');
    expect(register).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(register);
    expect(pwa).toMatch(/process\.env\.NODE_ENV !== "production"\) return;/);
  });
});

describe("manifest icons (src/app/manifest.ts)", () => {
  it("lists any and maskable as separate entries (no entry declares both)", () => {
    expect(manifestSrc).not.toMatch(/purpose:\s*"any maskable"/);
    expect(manifestSrc).toMatch(/purpose:\s*"any"/);
    expect(manifestSrc).toMatch(/purpose:\s*"maskable"/);
  });

  it("public/manifest.json duplicate is removed", () => {
    expect(() => read("public/manifest.json")).toThrow();
  });
});
