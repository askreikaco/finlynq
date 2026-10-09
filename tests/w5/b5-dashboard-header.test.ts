import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// W5-9: dashboard page header uses the shared page-header target classes.
const DASHBOARD = resolve(__dirname, "../../src/app/(app)/dashboard/page.tsx");
const src = readFileSync(DASHBOARD, "utf8");

const TITLE_TARGET = "text-2xl font-bold tracking-tight";
const SUBTITLE_TARGET = "text-sm text-muted-foreground mt-0.5";

describe("dashboard page header (W5-9)", () => {
  it("titleClassName matches the header target", () => {
    const values = [...src.matchAll(/(?<![A-Za-z])titleClassName="([^"]*)"/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toMatch(/^text-2xl font-bold tracking-tight( truncate| flex items-center gap-2)?$/);
    }
    expect(src).toContain(`titleClassName="${TITLE_TARGET}"`);
  });

  it("subtitleClassName equals the header target where present", () => {
    const values = [...src.matchAll(/subtitleClassName="([^"]*)"/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toBe(SUBTITLE_TARGET);
    }
  });

  it("old header strings are absent", () => {
    expect(src).not.toContain("text-xl font-semibold tracking-tight");
    expect(src).not.toContain("text-[13px] text-muted-foreground mt-0.5");
  });
});
