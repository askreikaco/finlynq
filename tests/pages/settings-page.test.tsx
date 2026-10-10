/**
 * Tests for /settings index page (src/app/(app)/settings/page.tsx). The hub renders at every size; the
 * FINLYNQ_NAV_V2 flag is retired, so the page no longer redirects to /settings/general.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT_TO_${path}`);
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  redirect: mockRedirect,
}));

describe("SettingsPage (/settings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([undefined, "0", "false", "1", "true", "yes"])(
    "renders SettingsHub with no redirect (FINLYNQ_NAV_V2=%s has no effect)",
    async (value) => {
      if (value === undefined) delete process.env.FINLYNQ_NAV_V2;
      else process.env.FINLYNQ_NAV_V2 = value;
      vi.resetModules();

      const { default: SettingsPage } = await import("@/app/(app)/settings/page");
      const result = SettingsPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result.type.name).toBe("SettingsHub");
    },
  );

  it("has no flag or redirect branch in the source", () => {
    const src = readFileSync(resolve(__dirname, "../../src/app/(app)/settings/page.tsx"), "utf-8");
    expect(src).not.toMatch(/redirect\(|isNavV2Enabled|FINLYNQ_NAV_V2|\/settings\/general/);
  });
});
