import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  SIZE_CLASS_REGULAR_MIN,
  SIZE_CLASS_WIDE_ABOVE,
} from "@/components/ui/size-class";

const ROOT = process.cwd();
const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf-8");
const layout = fs.readFileSync(path.join(ROOT, "src/app/(app)/layout.tsx"), "utf-8");

describe("size-class CSS (globals.css)", () => {
  it("declares the regular and wide container sizes in @theme", () => {
    expect(css).toMatch(/@theme\s*\{[^}]*--container-regular:\s*40rem;/);
    expect(css).toMatch(/@theme\s*\{[^}]*--container-wide:\s*64rem;/);
  });

  it("declares the regular custom variant on the 'app' container", () => {
    expect(css).toContain("@custom-variant regular (@container app (width >= 40rem));");
  });

  it("declares the wide custom variant on the 'app' container", () => {
    expect(css).toContain("@custom-variant wide (@container app (width > 64rem));");
  });

  it("declares the dense custom variant on data-density=compact", () => {
    expect(css).toContain("@custom-variant dense (&:where([data-density=compact] *));");
  });

  it("keeps the rem container sizes equal to the px thresholds in size-class.ts", () => {
    expect(40 * 16).toBe(SIZE_CLASS_REGULAR_MIN);
    expect(64 * 16).toBe(SIZE_CLASS_WIDE_ABOVE);
  });
});

describe("size-class wiring (layout.tsx)", () => {
  it("tags <main> so the app size-class provider can measure it", () => {
    expect(layout).toMatch(/<main\b[^>]*data-app-main=""/);
  });

  it("mounts AppSizeClassProvider in the (app) layout", () => {
    expect(layout).toContain("<AppSizeClassProvider>");
    expect(layout).toContain("</AppSizeClassProvider>");
  });
});
