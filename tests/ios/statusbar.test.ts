import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const layout = read("src/app/layout.tsx");

describe("iOS status bar is opaque (content must not scroll under a system blur)", () => {
  it("appleWebApp.statusBarStyle is 'black'", () => {
    expect(layout).toMatch(/statusBarStyle:\s*"black"/);
  });
  it("no 'black-translucent' remains in the root layout", () => {
    expect(layout).not.toContain("black-translucent");
  });
  it("viewportFit stays cover so the body inset (--sat) still applies", () => {
    expect(layout).toContain('viewportFit: "cover"');
  });
});
