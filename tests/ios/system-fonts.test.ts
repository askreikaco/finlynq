import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".ts", ".tsx", ".js", ".jsx", ".css", ".mjs"].includes(extname(name))) out.push(full);
  }
  return out;
}

describe("system fonts (no next/font, no web-font fetch)", () => {
  const layout = read("src/app/layout.tsx");
  const css = read("src/app/globals.css");

  it("layout.tsx has no next/font import", () => {
    expect(layout).not.toMatch(/next\/font/);
  });

  it("globals.css defines the system sans stack with system-ui and -apple-system", () => {
    const m = css.match(/--font-stack-sans:\s*([^;]+);/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("system-ui");
    expect(m![1]).toContain("-apple-system");
  });

  it("globals.css defines the system mono stack with ui-monospace", () => {
    const m = css.match(/--font-stack-mono:\s*([^;]+);/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("ui-monospace");
  });

  it("UI font select offers exactly the 4 system options, default first", async () => {
    const mod = await import("../../src/components/font-provider");
    expect(mod.FONT_OPTIONS.map((o: { key: string }) => o.key)).toEqual(["system", "rounded", "serif", "mono"]);
    expect(mod.FONT_OPTIONS[0].label).toBe("System (default)");
  });

  it("migrates the stored legacy Geist value to the system default", () => {
    const provider = read("src/components/font-provider.tsx");
    expect(provider).toMatch(/LEGACY_FONT_KEYS\s*=\s*\[[^\]]*"geist"/);
    expect(provider).toMatch(/localStorage\.removeItem\(FONT_STORAGE_KEY\)/);
    expect(provider).toMatch(/const DEFAULT_FONT: FontKey = "system";/);
  });

  it("no googleapis or gstatic host and no next/font/google in src or next.config", () => {
    const files = [...walk(join(root, "src")), join(root, "next.config.ts")];
    const hits = files.filter((f) => /fonts\.googleapis|fonts\.gstatic|next\/font\/google/.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => f.slice(root.length + 1))).toEqual([]);
  });
});
