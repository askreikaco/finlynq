/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Mock the flag before importing the layout
vi.mock("@/lib/nav-v2/flag", () => ({
  isNavV2Enabled: vi.fn(),
}));

import { isNavV2Enabled } from "@/lib/nav-v2/flag";
import SettingsLayout from "@/app/(app)/settings/layout";
import { SettingsShell } from "@/components/settings-shell";

describe("Settings Layout Back Button", () => {
  it("passes hubBackHref=/settings when isNavV2Enabled is true", () => {
    vi.mocked(isNavV2Enabled).mockReturnValue(true);

    const el = SettingsLayout({ children: "test content" });

    // The returned element should be a SettingsShell with hubBackHref="/settings"
    expect(el.type).toBe(SettingsShell);
    expect(el.props.hubBackHref).toBe("/settings");
  });

  it("passes hubBackHref=undefined when isNavV2Enabled is false", () => {
    vi.mocked(isNavV2Enabled).mockReturnValue(false);

    const el = SettingsLayout({ children: "test content" });

    // The returned element should be a SettingsShell with undefined hubBackHref
    expect(el.type).toBe(SettingsShell);
    expect(el.props.hubBackHref).toBeUndefined();
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
