/**
 * Tests for /settings index page (src/app/(app)/settings/page.tsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
    delete process.env.FINLYNQ_NAV_V2;
    vi.resetModules();

    const { default: SettingsPage } = await import("@/app/(app)/settings/page");

    try {
      SettingsPage();
      expect.fail("Expected redirect to be called");
    } catch {
      expect(mockRedirect).toHaveBeenCalledWith("/settings/general");
    }
  });

  it("redirects to /settings/general when FINLYNQ_NAV_V2='0'", async () => {
    process.env.FINLYNQ_NAV_V2 = "0";
    vi.resetModules();

    const { default: SettingsPage } = await import("@/app/(app)/settings/page");

    try {
      SettingsPage();
      expect.fail("Expected redirect to be called");
    } catch {
      expect(mockRedirect).toHaveBeenCalledWith("/settings/general");
    }
  });

  it("renders SettingsHub when FINLYNQ_NAV_V2='1'", async () => {
    process.env.FINLYNQ_NAV_V2 = "1";
    vi.resetModules();

    const { default: SettingsPage } = await import("@/app/(app)/settings/page");
    const result = SettingsPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.type.name).toBe("SettingsHub");
  });

  it("renders SettingsHub when FINLYNQ_NAV_V2='true'", async () => {
    process.env.FINLYNQ_NAV_V2 = "true";
    vi.resetModules();

    const { default: SettingsPage } = await import("@/app/(app)/settings/page");
    const result = SettingsPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.type.name).toBe("SettingsHub");
  });

  it("renders SettingsHub when FINLYNQ_NAV_V2='yes'", async () => {
    process.env.FINLYNQ_NAV_V2 = "yes";
    vi.resetModules();

    const { default: SettingsPage } = await import("@/app/(app)/settings/page");
    const result = SettingsPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.type.name).toBe("SettingsHub");
  });
});
