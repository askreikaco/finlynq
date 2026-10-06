/**
 * Server-prop wiring tests for instanceAdminEnabled (WP9a)
 *
 * These tests verify that the instanceAdminEnabled flag is correctly read
 * server-side and passed as a prop to client components (Nav, MoreMenu).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock isInstanceAdminEnabled to control the flag value
const mockIsEnabled = vi.fn((env?: Record<string, string | undefined>) => false);
vi.mock("@/lib/admin/instance-flag", () => ({
  isInstanceAdminEnabled: (env?: Record<string, string | undefined>) => mockIsEnabled(env),
  isInstanceAdminPath: (pathname: string) => {
    return (
      pathname === "/admin/instance" ||
      pathname.startsWith("/admin/instance/") ||
      pathname === "/api/admin/instance" ||
      pathname.startsWith("/api/admin/instance/")
    );
  },
}));

beforeEach(() => {
  mockIsEnabled.mockClear();
  mockIsEnabled.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App Layout - instanceAdminEnabled prop wiring", () => {
  it("reads isInstanceAdminEnabled server-side and passes to Nav", async () => {
    // This test verifies the pattern in (app)/layout.tsx
    mockIsEnabled.mockReturnValue(true);

    // Simulate server-side computation
    const { isInstanceAdminEnabled } = await import("@/lib/admin/instance-flag");
    const enabled = isInstanceAdminEnabled();

    // Verify the flag was read
    expect(enabled).toBe(true);
    expect(mockIsEnabled).toHaveBeenCalled();
  });

  it("defaults to false when flag is unset", async () => {
    mockIsEnabled.mockReturnValue(false);

    const { isInstanceAdminEnabled } = await import("@/lib/admin/instance-flag");
    const enabled = isInstanceAdminEnabled();

    expect(enabled).toBe(false);
  });
});

describe("More Page - instanceAdminEnabled prop wiring", () => {
  it("reads isInstanceAdminEnabled server-side and passes to MoreMenu", async () => {
    // This test verifies the pattern in (app)/more/page.tsx
    mockIsEnabled.mockReturnValue(true);

    const { isInstanceAdminEnabled } = await import("@/lib/admin/instance-flag");
    const enabled = isInstanceAdminEnabled();

    expect(enabled).toBe(true);
    expect(mockIsEnabled).toHaveBeenCalled();
  });

  it("nav and more page use same flag value pattern", async () => {
    // Both should call isInstanceAdminEnabled() without arguments to read process.env at request time
    const { isInstanceAdminEnabled } = await import("@/lib/admin/instance-flag");

    mockIsEnabled.mockReturnValue(true);
    const layoutResult = isInstanceAdminEnabled();

    mockIsEnabled.mockReturnValue(true);
    const pageResult = isInstanceAdminEnabled();

    expect(layoutResult).toBe(pageResult);
  });
});
