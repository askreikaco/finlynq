/**
 * Regression: /api/auth/mfa/verify and /api/auth/mfa/recovery/verify promote the pending login's
 * DEK onto the real session and then deleteDEK(pendingJti), which zeroes the cached buffer IN PLACE.
 * The session must own a COPY: before the fix every MFA-verified session (and the fire-and-forget
 * sweeps started from it) held an all-zero key, so every encrypted name decrypted to null.
 * Found by the Family Wealth e2e (viewers must have 2FA, so every viewer hit it).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 })),
}));
vi.mock("@/lib/auth/queries", () => ({
  getUserById: vi.fn(async (id: string) => ({ id, mfaEnabled: 1, mfaSecret: "v1:dummy" })),
  recordSuccessfulLogin: vi.fn(async () => undefined),
  upsertIdentity: vi.fn(),
}));
vi.mock("@/lib/crypto/envelope", () => ({ decryptField: vi.fn(() => "decrypted-secret") }));
vi.mock("@/lib/auth/mfa", () => ({
  verifyMfaCode: vi.fn(() => true),
  generateMfaSecret: vi.fn(),
  generateBackupCodes: vi.fn(),
}));
vi.mock("@/lib/auth/session-bundle", () => ({ commitSession: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/login-device", () => ({ applyTrustedDevicePolicy: vi.fn(async () => undefined) }));
vi.mock("@/lib/securities/backfill", () => ({ enqueueBackfillSecurities: vi.fn() }));
vi.mock("@/lib/email-import/upgrade-staging-encryption", () => ({ enqueueUpgradeStagingEncryption: vi.fn() }));
vi.mock("@/lib/email-import/process-pending-inbox", () => ({ enqueueProcessPendingInbox: vi.fn() }));
vi.mock("@/lib/crypto/upgrade-user-fields", () => ({ enqueueUpgradeUserFieldEncryption: vi.fn() }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
  },
}));
vi.mock("@/lib/auth/session-cutoff", () => ({
  getSessionCutoffCached: vi.fn(async () => null),
  isSessionRevokedByCutoff: vi.fn(() => false),
}));
vi.mock("@/db/schema-pg", () => ({ revokedJtis: { jti: "jti", expiresAt: "expires_at" } }));

import { createSessionToken } from "@/lib/auth/jwt";
import { getDEK, putDEK } from "@/lib/crypto/dek-cache";
import { enqueueUpgradeUserFieldEncryption } from "@/lib/crypto/upgrade-user-fields";
import { POST } from "@/app/api/auth/mfa/verify/route";

describe("/api/auth/mfa/verify: session DEK survives deleteDEK(pendingJti)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("session key is intact (not zeroed) and equals the pending key; sweeps get the live key", async () => {
    const userId = "u-mfa-dek-1";
    const key = Buffer.alloc(32, 0x42);
    const { token, jti: pendingJti } = await createSessionToken(userId, false, { pending: true, expirationTime: "5m" });
    putDEK(pendingJti, Buffer.from(key), 60_000, userId);

    const res = await POST(
      new NextRequest("http://localhost:3000/api/auth/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mfaPendingToken: token, code: "123456", trustDevice: false }),
      }),
    );
    expect(res.status, await res.clone().text()).toBe(200);

    // pending slot is gone, so the only live buffer for this user is the new session's.
    expect(getDEK(pendingJti, userId)).toBeNull();
    const swept = vi.mocked(enqueueUpgradeUserFieldEncryption).mock.calls[0][1] as Buffer;
    expect(swept.equals(key)).toBe(true); // not an all-zero buffer
    expect(swept.equals(Buffer.alloc(32, 0))).toBe(false);
  });
});
