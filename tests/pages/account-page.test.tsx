/**
 * @vitest-environment jsdom
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
    // Force the flag to be off
    const origEnv = process.env.FINLYNQ_NAV_V2;
    delete process.env.FINLYNQ_NAV_V2;

    const AccountPage = require("@/app/(app)/account/page").default;

    try {
      AccountPage();
      expect.fail("Expected redirect to be called");
    } catch (e) {
      expect(mockRedirect).toHaveBeenCalledWith("/account/info");
      expect((e as Error).message).toContain("REDIRECT_TO_/account/info");
    }

    if (origEnv) process.env.FINLYNQ_NAV_V2 = origEnv;
  });

  it("redirects to /account/info when FINLYNQ_NAV_V2='0'", async () => {
    process.env.FINLYNQ_NAV_V2 = "0";

    const AccountPage = require("@/app/(app)/account/page").default;

    try {
      AccountPage();
      expect.fail("Expected redirect to be called");
    } catch (e) {
      expect(mockRedirect).toHaveBeenCalledWith("/account/info");
    }
  });

  it("renders AccountHub when FINLYNQ_NAV_V2='1'", async () => {
    process.env.FINLYNQ_NAV_V2 = "1";

    // Clear the module cache to reload with new env
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      redirect: mockRedirect,
    }));

    const AccountPage = require("@/app/(app)/account/page").default;
    const result = AccountPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.props).toBeDefined();
  });

  it("renders AccountHub when FINLYNQ_NAV_V2='true'", async () => {
    process.env.FINLYNQ_NAV_V2 = "true";

    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      redirect: mockRedirect,
    }));

    const AccountPage = require("@/app/(app)/account/page").default;
    const result = AccountPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("renders AccountHub when FINLYNQ_NAV_V2='yes'", async () => {
    process.env.FINLYNQ_NAV_V2 = "yes";

    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      redirect: mockRedirect,
    }));

    const AccountPage = require("@/app/(app)/account/page").default;
    const result = AccountPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
