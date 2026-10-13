import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// W5-9: dashboard page header uses the shared page-header target classes.
const DASHBOARD = resolve(__dirname, "../../src/app/(app)/dashboard/page.tsx");
const src = readFileSync(DASHBOARD, "utf8");

const TITLE_TARGET = "text-2xl font-bold tracking-tight";

describe("dashboard page header (W5-9)", () => {
  it("passes no titleClassName (the one bar owns the title)", () => {
    const values = [...src.matchAll(/(?<![A-Za-z])titleClassName="([^"]*)"/g)].map((m) => m[1]);
    expect(values).toEqual([]);
    expect(src).not.toContain(`titleClassName="${TITLE_TARGET}"`);
  });

  it("passes no subtitleClassName", () => {
    const values = [...src.matchAll(/subtitleClassName="([^"]*)"/g)].map((m) => m[1]);
    expect(values).toEqual([]);
  });

  it("old header strings are absent", () => {
    expect(src).not.toContain("text-xl font-semibold tracking-tight");
    expect(src).not.toContain("text-[13px] text-muted-foreground mt-0.5");
  });
});
