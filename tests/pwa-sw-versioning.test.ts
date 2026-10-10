import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "..", "src", "app", "sw.ts"), "utf8");

describe("sw.ts per-build page cache versioning", () => {
  it("derives BUILD_ID from the precache manifest", () => {
    expect(src).toMatch(/const SW_MANIFEST = self\.__SW_MANIFEST;/);
    expect(src).toMatch(/const BUILD_ID = fnv1a\(JSON\.stringify\(SW_MANIFEST \?\? \[\]\)\)/);
  });

  it("references self.__SW_MANIFEST exactly once (the Serwist build plugin rejects more than one)", () => {
    expect(src.match(/self\.__SW_MANIFEST/g)?.length).toBe(1);
  });

  it("versions the HTML and RSC page caches with BUILD_ID", () => {
    expect(src).toContain("cacheName: `pages-html-cache-${BUILD_ID}`");
    expect(src).toContain("cacheName: `pages-rsc-cache-${BUILD_ID}`");
  });

  it("leaves hashed static caches unversioned", () => {
    expect(src).toContain('cacheName: "static-assets-cache"');
    expect(src).toContain('cacheName: "static-media-cache"');
  });

  it("reloads open windows once when upgrading from the legacy unversioned page caches", () => {
    expect(src).toContain('LEGACY_PAGE_CACHES = ["pages-html-cache", "pages-rsc-cache"]');
    expect(src).toContain("upgradedFromLegacy");
    expect(src).toContain("w.navigate?.(w.url)");
  });

  it("activate handler deletes stale pages-* caches only", () => {
    expect(src).toMatch(/self\.addEventListener\("activate"/);
    expect(src).toContain('STALE_PAGE_CACHE_PREFIXES = ["pages-html-cache", "pages-rsc-cache"]');
    expect(src).toMatch(/event\.waitUntil\(/);
    expect(src).toMatch(/caches\.keys\(\)/);
    expect(src).toMatch(/STALE_PAGE_CACHE_PREFIXES\.some\(\(prefix\) => key\.startsWith\(prefix\)\)/);
    expect(src).toMatch(/!key\.endsWith\(`-\$\{BUILD_ID\}`\)/);
    expect(src).toMatch(/\.map\(\(key\) => caches\.delete\(key\)\)/);
  });

  it("keeps the NetworkOnly auth/API rule paths unchanged", () => {
    const start = src.indexOf("// 1. Critical");
    const end = src.indexOf("// 2. HTML navigation");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    for (const p of ["/api/", "/auth", "/unlock", "/passkey", "/cloud", "/oauth"]) {
      expect(block).toContain(`path.startsWith("${p}")`);
    }
    expect(block).toContain("handler: new NetworkOnly()");
  });
});
