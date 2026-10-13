import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenMap, resolvedToken, type Theme } from "../helpers/css-tokens";

// Light/dark surface tokens from the owner spec (2026-10-13): page #f2f4f7 / #1c1c1d,
// card and section #ffffff / #252728, one shadow token, translucent liquid-glass cards.
const CSS = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8");

// oklch(L C H) -> [r,g,b] in 0..255 (sRGB, gamma-encoded, clamped).
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((x) => {
    const c = Math.min(Math.max(x, 0), 1);
    const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return g * 255;
  }) as [number, number, number];
}

// Parse a resolved token value: "oklch(L C H)", "oklch(L C H / A%)" or "#rrggbb".
function parseColor(v: string): { rgb: [number, number, number]; alpha: number } {
  const hex = v.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const m = v.trim().match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/);
  if (!m) throw new Error(`unparsed colour: ${v}`);
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] === "%" ? 100 : 1);
  return { rgb: oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3])), alpha };
}

const hexOf = (rgb: number[]) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

// WCAG relative luminance on 0..255 sRGB.
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg: number[], bg: number[]): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
// Composite a colour with alpha over an opaque backdrop.
const over = (fg: number[], alpha: number, bg: number[]) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

const token = (name: string, theme: Theme) => {
  const v = resolvedToken(CSS, name, theme);
  if (v === undefined) throw new Error(`token ${name} missing for ${theme}`);
  return parseColor(v);
};
const opaque = (name: string, theme: Theme) => token(name, theme).rgb;

const HEX_TOL = 1; // +/- 1/255 per channel

describe("theme tokens: page and card colours", () => {
  it("light --background is #f2f4f7 and --card is white", () => {
    const bg = hexOf(opaque("--background", "light"));
    expect(bg).toBe("#f2f4f7");
    const card = opaque("--card", "light");
    for (const c of card) expect(Math.abs(c - 255)).toBeLessThanOrEqual(HEX_TOL);
  });

  it("dark --background is #1c1c1d and --card is #252728 (+/-1/255)", () => {
    const bg = opaque("--background", "dark");
    [0x1c, 0x1c, 0x1d].forEach((want, i) => expect(Math.abs(bg[i] - want)).toBeLessThanOrEqual(HEX_TOL));
    const card = opaque("--card", "dark");
    [0x25, 0x27, 0x28].forEach((want, i) => expect(Math.abs(card[i] - want)).toBeLessThanOrEqual(HEX_TOL));
  });

  it("popover matches card in both themes; rail --sidebar matches card", () => {
    for (const theme of ["light", "dark"] as Theme[]) {
      expect(hexOf(opaque("--popover", theme))).toBe(hexOf(opaque("--card", theme)));
      expect(hexOf(opaque("--sidebar", theme))).toBe(hexOf(opaque("--card", theme)));
    }
  });
});

describe("theme tokens: one card shadow", () => {
  const SHADOW = "0 2px 4px 0 rgb(0 0 0 / 0.1)";

  it.each(["light", "dark"] as Theme[])("--shadow-card is exactly the owner shadow in %s", (theme) => {
    const v = resolvedToken(CSS, "--shadow-card", theme);
    expect(v).toBeDefined();
    expect(v!.replace(/\s+/g, " ").trim()).toBe(SHADOW);
    expect(v!.split(/,(?![^(]*\))/)).toHaveLength(1);
  });

  it("card glass shadow reads the shared token (no per-surface shadow left)", () => {
    for (const theme of ["light", "dark"] as Theme[]) {
      expect(tokenMap(CSS, theme).get("--glass-card-shadow")).toBe("var(--shadow-card)");
    }
  });
});

describe("theme tokens: liquid glass card", () => {
  it.each(["light", "dark"] as Theme[])("--glass-card-blur is 14px and --glass-card-sat is 1.4 in %s", (theme) => {
    expect(resolvedToken(CSS, "--glass-card-blur", theme)).toBe("14px");
    expect(resolvedToken(CSS, "--glass-card-sat", theme)).toBe("1.4");
  });

  it.each(["light", "dark"] as Theme[])("--glass-card-bg is the card colour at 72%% alpha in %s", (theme) => {
    const g = token("--glass-card-bg", theme);
    expect(g.alpha).toBeCloseTo(0.72, 5);
    const card = opaque("--card", theme);
    g.rgb.forEach((c, i) => expect(Math.abs(c - card[i])).toBeLessThanOrEqual(HEX_TOL));
  });

  it("the tab bar keeps its 32px blur (tests pin it)", () => {
    expect(resolvedToken(CSS, "--glass-tabbar-blur", "light")).toBe("32px");
  });
});

describe("theme tokens: contrast on page, card and glass (4.5:1 body text)", () => {
  // Text tokens that sit on the page or on a card; each must reach 4.5:1 on background, card and glass.
  const TEXT = [
    "--foreground",
    "--card-foreground",
    "--muted-foreground",
    "--secondary-foreground",
    "--primary-text",
    "--pos",
    "--warning",
    "--info",
    "--destructive",
  ];
  for (const theme of ["light", "dark"] as Theme[]) {
    it.each(TEXT)(`${theme}: %s is >= 4.5:1 on background, card and glass`, (name) => {
      const bg = opaque("--background", theme);
      const card = opaque("--card", theme);
      const g = token("--glass-card-bg", theme);
      const glass = over(g.rgb, g.alpha, bg);
      const fg = opaque(name, theme);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, glass)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
