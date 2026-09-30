import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import manifest from "@/app/manifest";
import path from "path";

describe("Manifest", () => {
  it("exports a function that returns manifest metadata", () => {
    const manifestData = manifest();
    expect(manifestData).toBeTruthy();
    expect(manifestData.name).toBe("Finlynq");
  });

  it("manifest has standalone display mode", () => {
    const manifestData = manifest();
    expect(manifestData.display).toBe("standalone");
  });

  it("manifest start_url is /dashboard", () => {
    const manifestData = manifest();
    expect(manifestData.start_url).toBe("/dashboard");
  });

  it("manifest has both 192x192 and 512x512 icons", () => {
    const manifestData = manifest();
    expect(manifestData.icons).toBeTruthy();

    const sizes = manifestData.icons?.map((icon) => icon.sizes) ?? [];
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("icon files exist on disk", async () => {
    const icon192Path = path.resolve(process.cwd(), "public/icons/icon-192.png");
    const icon512Path = path.resolve(process.cwd(), "public/icons/icon-512.png");

    const exists192 = await fs.stat(icon192Path).then(() => true).catch(() => false);
    const exists512 = await fs.stat(icon512Path).then(() => true).catch(() => false);

    expect(exists192).toBe(true);
    expect(exists512).toBe(true);
  });

  it("apple-touch-icon exists on disk", async () => {
    const appleTouchPath = path.resolve(process.cwd(), "public/apple-touch-icon.png");
    const exists = await fs.stat(appleTouchPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("manifest has maskable icon purpose", () => {
    const manifestData = manifest();
    const maskableIcons =
      manifestData.icons?.filter((icon) => icon.purpose?.includes("maskable")) ?? [];
    expect(maskableIcons.length).toBeGreaterThan(0);
  });
});
