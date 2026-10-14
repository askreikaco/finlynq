import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "@/app/manifest";
import { metadata, viewport } from "@/app/layout";

const root = join(__dirname, "..");
const abs = (p: string) => join(root, p.replace(/^\//, ""));

/** Read width/height/colour type from a PNG IHDR chunk (no image dependency). */
function pngInfo(p: string): { width: number; height: number; colorType: number } {
  const buf = readFileSync(abs(p));
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

const m = manifest();

describe("manifest theme colours", () => {
  it("theme_color and background_color are the app dark background #1c1c1d", () => {
    expect(m.theme_color).toBe("#1c1c1d");
    expect(m.background_color).toBe("#1c1c1d");
  });
});

describe("maskable icons", () => {
  const icons = m.icons ?? [];
  const maskable = icons.filter((i) => i.purpose === "maskable");
  const any = icons.filter((i) => i.purpose === "any");

  it("maskable entries are the dedicated maskable files, purpose 'maskable' only", () => {
    expect(maskable.map((i) => i.src).sort()).toEqual([
      "/icons/icon-maskable-192.png",
      "/icons/icon-maskable-512.png",
    ]);
    for (const icon of maskable) expect(icon.purpose).toBe("maskable");
  });

  it("maskable files exist on disk with the declared size", () => {
    for (const icon of maskable) {
      expect(existsSync(abs(`public${icon.src}`))).toBe(true);
      const [w, h] = (icon.sizes as string).split("x").map(Number);
      const info = pngInfo(`public${icon.src}`);
      expect(info.width).toBe(w);
      expect(info.height).toBe(h);
    }
  });

  it("'any' icons keep the existing 192 and 512 files", () => {
    expect(any.map((i) => i.src).sort()).toEqual(["/icons/icon-192.png", "/icons/icon-512.png"]);
  });

  it("apple touch icon 180 exists, is 180x180 and opaque RGB (no alpha)", () => {
    const info = pngInfo("public/icons/apple-touch-icon-180.png");
    expect(info.width).toBe(180);
    expect(info.height).toBe(180);
    expect(info.colorType).toBe(2);
    const apple = metadata.icons && typeof metadata.icons === "object" ? (metadata.icons as { apple?: unknown }).apple : undefined;
    expect(JSON.stringify(apple)).toContain("/icons/apple-touch-icon-180.png");
  });
});

describe("shortcuts", () => {
  const shortcuts = m.shortcuts ?? [];
  it("has Add transaction, Accounts and Categories", () => {
    expect(shortcuts.map((s) => s.name)).toEqual(["Add transaction", "Accounts", "Categories"]);
  });
  it("every shortcut url maps to an existing app route page", () => {
    for (const s of shortcuts) {
      const segs = s.url.split("/").filter(Boolean);
      const page = join(root, "src/app/(app)", ...segs, "page.tsx");
      expect(existsSync(page), `missing route for ${s.url}`).toBe(true);
    }
  });
  it("every shortcut has a 192 icon that exists", () => {
    for (const s of shortcuts) {
      expect(s.icons?.length).toBeGreaterThan(0);
      for (const icon of s.icons ?? []) {
        expect(existsSync(abs(`public${icon.src}`))).toBe(true);
      }
    }
  });
});

describe("manifest install fields", () => {
  it("keeps id and start_url and adds display_override, lang, dir, prefer_related_applications", () => {
    expect(m.id).toBe("/dashboard");
    expect(m.start_url).toBe("/dashboard");
    expect(m.display_override).toEqual(["standalone", "minimal-ui"]);
    expect(m.lang).toBe("en");
    expect(m.dir).toBe("ltr");
    expect(m.prefer_related_applications).toBe(false);
  });
});

describe("iOS startup images", () => {
  const images = (metadata.appleWebApp as { startupImage?: { url: string; media: string }[] }).startupImage ?? [];

  it("registers one startup image per iPhone size", () => {
    expect(images.length).toBe(7);
  });

  it("every startup image exists and matches its media query device size and DPR", () => {
    for (const img of images) {
      expect(existsSync(abs(`public${img.url}`)), img.url).toBe(true);
      const w = Number(/device-width:\s*(\d+)px/.exec(img.media)?.[1]);
      const h = Number(/device-height:\s*(\d+)px/.exec(img.media)?.[1]);
      const dpr = Number(/-webkit-device-pixel-ratio:\s*(\d+)/.exec(img.media)?.[1]);
      const info = pngInfo(`public${img.url}`);
      expect(info.width).toBe(w * dpr);
      expect(info.height).toBe(h * dpr);
      expect(img.media).toContain("(orientation: portrait)");
    }
  });
});

describe("viewport theme colour is per colour scheme", () => {
  const tc = viewport.themeColor as { media: string; color: string }[];
  it("light scheme uses #f2f4f7 and dark scheme uses #1c1c1d", () => {
    expect(tc).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
      { media: "(prefers-color-scheme: dark)", color: "#1c1c1d" },
    ]);
  });
});
