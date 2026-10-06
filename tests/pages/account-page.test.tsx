/**
 * Tests for /account index page (src/app/(app)/account/page.tsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation redirect to throw
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT_TO_${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

describe("AccountPage (/account)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FINLYNQ_NAV_V2;
  });

  it("redirects to /account/info when FINLYNQ_NAV_V2 is unset", async () => {
    delete process.env.FINLYNQ_NAV_V2;
    vi.resetModules();

    const { default: AccountPage } = await import("@/app/(app)/account/page");

    try {
      AccountPage();
      expect.fail("Expected redirect to be called");
    } catch {
      expect(mockRedirect).toHaveBeenCalledWith("/account/info");
    }
  });

  it("redirects to /account/info when FINLYNQ_NAV_V2='0'", async () => {
    process.env.FINLYNQ_NAV_V2 = "0";
    vi.resetModules();

    const { default: AccountPage } = await import("@/app/(app)/account/page");

    try {
      AccountPage();
      expect.fail("Expected redirect to be called");
    } catch {
      expect(mockRedirect).toHaveBeenCalledWith("/account/info");
    }
  });

  it("renders AccountHub when FINLYNQ_NAV_V2='1'", async () => {
    process.env.FINLYNQ_NAV_V2 = "1";
    vi.resetModules();

    const { default: AccountPage } = await import("@/app/(app)/account/page");
    const result = AccountPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.type.name).toBe("AccountHub");
  });

  it("renders AccountHub when FINLYNQ_NAV_V2='true'", async () => {
    process.env.FINLYNQ_NAV_V2 = "true";
    vi.resetModules();

    const { default: AccountPage } = await import("@/app/(app)/account/page");
    const result = AccountPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.type.name).toBe("AccountHub");
  });

  it("renders AccountHub when FINLYNQ_NAV_V2='yes'", async () => {
    process.env.FINLYNQ_NAV_V2 = "yes";
    vi.resetModules();

    const { default: AccountPage } = await import("@/app/(app)/account/page");
    const result = AccountPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.type.name).toBe("AccountHub");
  });
});
