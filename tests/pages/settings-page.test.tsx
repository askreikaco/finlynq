/**
 * @vitest-environment jsdom
 * Tests for /settings index page (src/app/(app)/settings/page.tsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation redirect to throw
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT_TO_${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

describe("SettingsPage (/settings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FINLYNQ_NAV_V2;
  });

  it("redirects to /settings/general when FINLYNQ_NAV_V2 is unset", async () => {
    // Force the flag to be off
    const origEnv = process.env.FINLYNQ_NAV_V2;
    delete process.env.FINLYNQ_NAV_V2;

    const SettingsPage = require("@/app/(app)/settings/page").default;

    try {
      SettingsPage();
      expect.fail("Expected redirect to be called");
    } catch (e) {
      expect(mockRedirect).toHaveBeenCalledWith("/settings/general");
      expect((e as Error).message).toContain("REDIRECT_TO_/settings/general");
    }

    if (origEnv) process.env.FINLYNQ_NAV_V2 = origEnv;
  });

  it("redirects to /settings/general when FINLYNQ_NAV_V2='0'", async () => {
    process.env.FINLYNQ_NAV_V2 = "0";

    const SettingsPage = require("@/app/(app)/settings/page").default;

    try {
      SettingsPage();
      expect.fail("Expected redirect to be called");
    } catch (e) {
      expect(mockRedirect).toHaveBeenCalledWith("/settings/general");
    }
  });

  it("renders SettingsHub when FINLYNQ_NAV_V2='1'", async () => {
    process.env.FINLYNQ_NAV_V2 = "1";

    // Clear the module cache to reload with new env
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      redirect: mockRedirect,
    }));

    const SettingsPage = require("@/app/(app)/settings/page").default;
    const result = SettingsPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.props).toBeDefined();
  });

  it("renders SettingsHub when FINLYNQ_NAV_V2='true'", async () => {
    process.env.FINLYNQ_NAV_V2 = "true";

    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      redirect: mockRedirect,
    }));

    const SettingsPage = require("@/app/(app)/settings/page").default;
    const result = SettingsPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("renders SettingsHub when FINLYNQ_NAV_V2='yes'", async () => {
    process.env.FINLYNQ_NAV_V2 = "yes";

    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      redirect: mockRedirect,
    }));

    const SettingsPage = require("@/app/(app)/settings/page").default;
    const result = SettingsPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
