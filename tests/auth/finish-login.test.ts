/**
 * Tests for finishPasswordLogin and issueSessionForDek.
 *
 * Covers:
 * - Non-MFA user → kind "session", putDEK called once with the returned jti
 * - MFA user → kind "mfa", no full session token issued, DEK cached under pending jti
 * - Unwrap failure propagates as expected
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

const mockUsers = new Map<string, { kekSalt: string; dekWrapped: string; dekWrappedIv: string; dekWrappedTag: string; pepperVersion?: number }>();
const putDEKCalls: Array<{ jti: string; dek: Buffer; ttl: number; userId: string }> = [];
const recordedLogins = new Set<string>();

vi.mock("@/lib/auth/queries", () => ({
  recordSuccessfulLogin: vi.fn(async (userId: string) => {
    recordedLogins.add(userId);
  }),
  promoteUserToEncryption: vi.fn(),
}));

vi.mock("@/lib/crypto/dek-cache", () => ({
  getDEK: vi.fn(() => null),
  putDEK: vi.fn((sessionId: string, dek: Buffer, ttlMs: number, userId: string) => {
    putDEKCalls.push({ jti: sessionId, dek, ttl: ttlMs, userId });
  }),
}));

vi.mock("@/lib/validate", () => ({
  logApiError: vi.fn(),
}));

vi.mock("@/lib/securities/backfill", () => ({
  enqueueBackfillSecurities: vi.fn(),
}));

vi.mock("@/lib/email-import/upgrade-staging-encryption", () => ({
  enqueueUpgradeStagingEncryption: vi.fn(),
}));

vi.mock("@/lib/email-import/process-pending-inbox", () => ({
  enqueueProcessPendingInbox: vi.fn(),
}));

vi.mock("@/lib/crypto/upgrade-user-fields", () => ({
  enqueueUpgradeUserFieldEncryption: vi.fn(),
}));

vi.mock("@/lib/external-import/simplefin-orchestrator", () => ({
  enqueueAutoSyncSimpleFin: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn((_strings: TemplateStringsArray) => ({})),
}));

import { finishPasswordLogin, issueSessionForDek } from "@/lib/auth/finish-login";
import { _clearRevokedJtiCache } from "@/lib/auth/jwt";
import { createWrappedDEKForPassword } from "@/lib/crypto/envelope";

// AuthUser interface for type safety (mirrors the type in finish-login.ts for testing)
type AuthUser = {
  id: string;
  mfaEnabled: number;
  kekSalt?: string | null;
  dekWrapped?: string | null;
  dekWrappedIv?: string | null;
  dekWrappedTag?: string | null;
  pepperVersion?: number | null;
};

describe("finishPasswordLogin and issueSessionForDek", () => {
  beforeEach(() => {
    putDEKCalls.length = 0;
    recordedLogins.clear();
    _clearRevokedJtiCache();
    mockUsers.clear();
  });

  describe("non-MFA user", () => {
    it("should return kind='session' with token and jti", async () => {
      // Set up a non-MFA user with valid DEK envelope
      const { wrapped } = createWrappedDEKForPassword("test-password");
      const testUserId = "user-non-mfa";

      const user = {
        id: testUserId,
        mfaEnabled: 0,
        kekSalt: wrapped.salt.toString("base64"),
        dekWrapped: wrapped.wrapped.toString("base64"),
        dekWrappedIv: wrapped.iv.toString("base64"),
        dekWrappedTag: wrapped.tag.toString("base64"),
        pepperVersion: 1,
      };

      const result = await finishPasswordLogin(user, "test-password");

      expect(result.kind).toBe("session");
      if (result.kind === "session") {
        expect(result.token).toBeTruthy();
        expect(result.jti).toBeTruthy();
        expect(result.dek).toBeTruthy();
        expect(recordedLogins.has(testUserId)).toBe(true);
        expect(putDEKCalls.length).toBe(1);
        expect(putDEKCalls[0].userId).toBe(testUserId);
        expect(putDEKCalls[0].jti).toBe(result.jti);
      }
    });
  });

  describe("MFA-enabled user", () => {
    it("should return kind='mfa' with pending token, no full session", async () => {
      const { wrapped } = createWrappedDEKForPassword("test-password");
      const testUserId = "user-mfa";

      const user = {
        id: testUserId,
        mfaEnabled: 1,
        kekSalt: wrapped.salt.toString("base64"),
        dekWrapped: wrapped.wrapped.toString("base64"),
        dekWrappedIv: wrapped.iv.toString("base64"),
        dekWrappedTag: wrapped.tag.toString("base64"),
        pepperVersion: 1,
      };

      const result = await finishPasswordLogin(user, "test-password");

      expect(result.kind).toBe("mfa");
      if (result.kind === "mfa") {
        expect(result.token).toBeTruthy();
        expect(result.jti).toBeTruthy();
        expect(result.dek).toBeTruthy();
        // MFA path should NOT call recordSuccessfulLogin
        expect(recordedLogins.has(testUserId)).toBe(false);
        // MFA path should cache DEK under a 5-minute TTL
        expect(putDEKCalls.length).toBe(1);
        expect(putDEKCalls[0].ttl).toBe(5 * 60_000); // 5 minutes
        expect(putDEKCalls[0].userId).toBe(testUserId);
      }
    });
  });

  describe("issueSessionForDek", () => {
    it("should create a full session for non-MFA users", async () => {
      const testUserId = "user-direct-session";
      const { dek } = createWrappedDEKForPassword("test-password");

      const user = {
        id: testUserId,
        mfaEnabled: 0,
      };

      const result = await issueSessionForDek(user as unknown as AuthUser, dek);

      expect(result.kind).toBe("session");
      if (result.kind === "session") {
        expect(result.token).toBeTruthy();
        expect(result.jti).toBeTruthy();
        expect(result.dek).toBe(dek);
      }
      expect(recordedLogins.has(testUserId)).toBe(true);
    });

    it("should create a pending token for MFA users", async () => {
      const testUserId = "user-direct-mfa";
      const { dek } = createWrappedDEKForPassword("test-password");

      const user = {
        id: testUserId,
        mfaEnabled: 1,
      };

      const result = await issueSessionForDek(user as unknown as AuthUser, dek);

      expect(result.kind).toBe("mfa");
      if (result.kind === "mfa") {
        expect(result.token).toBeTruthy();
        expect(result.jti).toBeTruthy();
        expect(result.dek).toBe(dek);
      }
      expect(recordedLogins.has(testUserId)).toBe(false);
    });

    it("should handle null DEK gracefully (encryption promotion failed)", async () => {
      const testUserId = "user-no-dek";

      const user = {
        id: testUserId,
        mfaEnabled: 0,
      };

      const result = await issueSessionForDek(user as unknown as AuthUser, null);

      expect(result.kind).toBe("session");
      if (result.kind === "session") {
        expect(result.token).toBeTruthy();
        expect(result.dek).toBeNull();
      }
      // putDEK should not be called when dek is null
      expect(putDEKCalls.length).toBe(0);
      expect(recordedLogins.has(testUserId)).toBe(true);
    });
  });

  describe("pre-encryption (legacy) users", () => {
    it("should handle users without DEK envelope and call promotion", async () => {
      const testUserId = "user-legacy";

      const user = {
        id: testUserId,
        mfaEnabled: 0,
        // No DEK envelope fields — triggers promotion path
      };

      const result = await finishPasswordLogin(user as unknown as AuthUser, "test-password");

      expect(result.kind).toBe("session");
      if (result.kind === "session") {
        expect(result.token).toBeTruthy();
      }
      // Should still issue a session even if promotion failed
      expect(recordedLogins.has(testUserId)).toBe(true);
    });
  });

  describe("DEK unwrap failure", () => {
    it("should return kind='unlock_failed' when DEK unwrap fails", async () => {
      // This test uses real createWrappedDEKForPassword but corrupts the envelope
      // by passing invalid base64 data. When unwrapDEK tries to decrypt, it fails.
      const testUserId = "user-unwrap-fail";

      const user = {
        id: testUserId,
        mfaEnabled: 0,
        kekSalt: "invalid-base64-that-will-fail",
        dekWrapped: "invalid-base64-that-will-fail",
        dekWrappedIv: "invalid-base64-that-will-fail",
        dekWrappedTag: "invalid-base64-that-will-fail",
        pepperVersion: 1,
      };

      const result = await finishPasswordLogin(user as unknown as AuthUser, "test-password");

      expect(result.kind).toBe("unlock_failed");
      // Should not have issued a session
      expect(recordedLogins.has(testUserId)).toBe(false);
      // Should not have cached a DEK
      expect(putDEKCalls.length).toBe(0);
    });
  });
});
