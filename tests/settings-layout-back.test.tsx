/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import SettingsLayout from "@/app/(app)/settings/layout";
import { SettingsShell } from "@/components/settings-shell";

describe("Settings Layout (FINLYNQ_NAV_V2 retired)", () => {
  it("always renders SettingsShell with no hubBackHref prop: the hub is the back target at every size", () => {
    const el = SettingsLayout({ children: "test content" });

    expect(el.type).toBe(SettingsShell);
    expect(el.props).not.toHaveProperty("hubBackHref");
  });

  it("does not have 'use client' directive at the top", () => {
    const layoutPath = resolve(__dirname, "../src/app/(app)/settings/layout.tsx");
    const content = readFileSync(layoutPath, "utf-8");
    const firstNonCommentLine = content
      .split("\n")
      .find((line) => line.trim() && !line.trim().startsWith("/*") && !line.trim().startsWith("*") && !line.trim().startsWith("//"));

    expect(firstNonCommentLine).not.toMatch(/^["']use client["']/);
  });
});
