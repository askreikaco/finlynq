import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

import { recordMcpApiKeyUse } from "@/lib/mcp/api-key-usage";
import { db } from "@/db";

describe("recordMcpApiKeyUse", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls the DB update on the first call", async () => {
    const mockChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };
    vi.mocked(db.update).mockReturnValue(mockChain as any);

    await recordMcpApiKeyUse("user-123");

    expect(db.update).toHaveBeenCalled();
  });

  it("skips DB write within the 1-hour throttle window", async () => {
    const mockChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };
    vi.mocked(db.update).mockReturnValue(mockChain as any);

    await recordMcpApiKeyUse("user-123");
    const firstCallCount = vi.mocked(db.update).mock.calls.length;

    // Second call within 1 hour should skip the DB write
    await recordMcpApiKeyUse("user-123");
    expect(vi.mocked(db.update).mock.calls.length).toBe(firstCallCount); // No additional call
  });

  it("allows DB write for different users", async () => {
    const mockChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };
    vi.mocked(db.update).mockReturnValue(mockChain as any);

    await recordMcpApiKeyUse("user-123");
    const firstCallCount = vi.mocked(db.update).mock.calls.length;

    await recordMcpApiKeyUse("user-456");
    // Should have made another call for the different user
    expect(vi.mocked(db.update).mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it("does not throw when DB update fails", async () => {
    vi.mocked(db.update).mockImplementation(() => {
      throw new Error("DB error");
    });

    // Should not throw
    await expect(recordMcpApiKeyUse("user-123")).resolves.toBeUndefined();
  });

  it("does not rethrow errors (fire-and-forget behavior)", async () => {
    vi.mocked(db.update).mockImplementation(() => {
      throw new Error("DB error");
    });

    // Calling recordMcpApiKeyUse with a DB error should not throw
    // This verifies the fire-and-forget behavior
    const result = recordMcpApiKeyUse("user-123");
    await expect(result).resolves.not.toThrow();
  });
});
