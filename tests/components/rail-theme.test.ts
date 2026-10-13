import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Sidebar (rail) tokens must be light in :root and dark in .dark. Parses the top-level blocks.
const CSS = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function blockWith(selector: string, needle: string): string {
  const re = new RegExp(`^${selector.replace(/\./g, "\\.")} \\{([^}]*)\\}`, "gm");
  for (const m of CSS.matchAll(re)) if (m[1].includes(needle)) return m[1];
  throw new Error(`no ${selector} block with ${needle}`);
}

// oklch(L C H) -> L is the first number after "oklch(" (0..1 or a percentage).
function lightness(block: string, prop: string): number {
  const m = block.match(new RegExp(`${prop}:\\s*oklch\\(\\s*([\\d.]+)`));
  if (!m) throw new Error(`${prop} not found`);
  return Number(m[1]);
}

describe("rail (sidebar tokens) follows the theme", () => {
  const root = blockWith(":root", "--sidebar:");
  const dark = blockWith(".dark", "--sidebar:");

  it("light :root sidebar is light (L > 0.9) for the background and foreground pair", () => {
    expect(lightness(root, "--sidebar")).toBeGreaterThan(0.9);
    expect(lightness(root, "--sidebar-accent")).toBeGreaterThan(0.9);
    expect(lightness(root, "--sidebar-foreground")).toBeLessThan(0.3);
  });

  it("dark .dark sidebar is the card colour #252728 (L ~ 0.271), so the rail matches cards", () => {
    expect(lightness(dark, "--sidebar")).toBeCloseTo(0.2711, 3);
    expect(lightness(dark, "--sidebar-foreground")).toBeGreaterThan(0.8);
  });

  it("light rail is the card colour #ffffff (sidebar token equals card token)", () => {
    expect(root).toMatch(/--sidebar:\s*oklch\(1 0 0\)/);
    expect(root).toMatch(/--card:\s*oklch\(1 0 0\)/);
  });

  it("the rail uses the sidebar token, not a hardcoded dark fill", () => {
    const nav = readFileSync(join(__dirname, "../../src/components/nav.tsx"), "utf8");
    expect(nav).toContain("bg-sidebar/80");
    expect(nav).toContain("backdrop-blur-[var(--glass-card-blur)]");
    expect(nav).not.toMatch(/bg-(black|zinc-9|neutral-9|slate-9)/);
  });
});
