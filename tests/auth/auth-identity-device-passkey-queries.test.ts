/**
 * Tests for identity, device, passkey, and recovery code query functions.
 *
 * These are minimal smoke tests that verify the functions exist and use the db
 * proxy correctly. Full integration testing requires a real Postgres instance.
 */

import { describe, it, expect, vi } from "vitest";

const updateSpy = vi.fn();
const updateSetSpy = vi.fn();
const deleteSpy = vi.fn();

vi.mock("@/db", () => {
  return {
    db: {
      delete: (...args: unknown[]) => {
        deleteSpy(...args);
        return {
          where: (..._wa: unknown[]) => Promise.resolve({ rowCount: 1 }),
        };
      },
      update: (...args: unknown[]) => {
        updateSpy(...args);
        return {
          set: (...sa: unknown[]) => {
            updateSetSpy(...sa);
            return {
              where: (..._wa: unknown[]) => Promise.resolve({ rowCount: 1 }),
            };
          },
        };
      },
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve([{ count: 0 }]).then(resolve),
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => Promise.resolve(),
        }),
      }),
    },
  };
});

import {
  consumeRecoveryCode,
  revokeAllDevices,
  setPasskeyPrfWrap,
  deleteDevices,
  listIdentities,
} from "@/lib/auth/queries";

describe("identity, device, passkey, and recovery code queries", () => {
  it("consumeRecoveryCode returns boolean based on rowCount", async () => {
    updateSetSpy.mockClear();
    updateSpy.mockClear();

    // Test successful consumption
    const result = await consumeRecoveryCode("u-123", "code-hash");
    expect(typeof result).toBe("boolean");
  });

  it("revokeAllDevices issues an UPDATE", async () => {
    updateSpy.mockClear();
    updateSetSpy.mockClear();
    await revokeAllDevices("u-123");
    expect(updateSpy).toHaveBeenCalled();
    expect(updateSetSpy).toHaveBeenCalled();
  });

  it("setPasskeyPrfWrap updates passkey with PRF wrap value", async () => {
    updateSpy.mockClear();
    updateSetSpy.mockClear();
    await setPasskeyPrfWrap("pk-123", "wrapped-prf");
    expect(updateSpy).toHaveBeenCalled();
    const setCall = updateSetSpy.mock.calls[0][0] as { dekWrappedPrf?: string };
    expect(setCall.dekWrappedPrf).toBe("wrapped-prf");
  });

  it("setPasskeyPrfWrap can clear PRF wrap with null", async () => {
    updateSpy.mockClear();
    updateSetSpy.mockClear();
    await setPasskeyPrfWrap("pk-123", null);
    const setCall = updateSetSpy.mock.calls[0][0] as { dekWrappedPrf?: string | null };
    expect(setCall.dekWrappedPrf).toBeNull();
  });

  it("deleteDevices issues a DELETE", async () => {
    deleteSpy.mockClear();
    await deleteDevices("u-123");
    expect(deleteSpy).toHaveBeenCalled();
  });

  it("listIdentities can be called without errors", async () => {
    await listIdentities("u-123");
    // Just verify it doesn't throw
    expect(true).toBe(true);
  });
});
