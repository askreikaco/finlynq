/**
 * Tests for /account index page (src/app/(app)/account/page.tsx). The hub renders at every size; the
 * FINLYNQ_NAV_V2 flag is retired, so the page no longer redirects and reads no env var.
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

describe("AccountPage (/account)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([undefined, "0", "false", "1", "true", "yes"])(
    "renders AccountHub with no redirect (FINLYNQ_NAV_V2=%s has no effect)",
    async (value) => {
      if (value === undefined) delete process.env.FINLYNQ_NAV_V2;
      else process.env.FINLYNQ_NAV_V2 = value;
      vi.resetModules();

      const { default: AccountPage } = await import("@/app/(app)/account/page");
      const result = AccountPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result.type.name).toBe("AccountHub");
    },
  );

  it("has no flag or redirect branch in the source", () => {
    const src = readFileSync(resolve(__dirname, "../../src/app/(app)/account/page.tsx"), "utf-8");
    expect(src).not.toMatch(/redirect\(|isNavV2Enabled|FINLYNQ_NAV_V2/);
  });
});
