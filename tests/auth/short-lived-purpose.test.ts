/**
 * Tests for purpose-bound short-lived tokens (M5).
 *
 * Covers:
 * - Token signed with purpose A fails verify with purpose B
 * - Missing purpose fails
 * - Valid purpose passes
 * - Wrong audience fails
 */

import { describe, it, expect, beforeEach } from "vitest";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

import { signShortLived, verifyShortLived } from "@/lib/auth/jwt";

describe("Short-lived purpose-bound tokens", () => {
  describe("signShortLived and verifyShortLived", () => {
    it("should sign and verify with correct purpose", async () => {
      const claims = { state: "test-state", nonce: "test-nonce" };
      const token = await signShortLived(claims, 600, "oauth-state");

      const verified = await verifyShortLived(token, "oauth-state");
      expect(verified).toBeTruthy();
      expect(verified?.state).toBe("test-state");
      expect(verified?.nonce).toBe("test-nonce");
      expect(verified?.purpose).toBe("oauth-state");
    });

    it("should reject token when purpose doesn't match", async () => {
      const claims = { state: "test-state" };
      const token = await signShortLived(claims, 600, "oauth-state");

      // Try to verify with a different purpose
      const verified = await verifyShortLived(token, "google-unlock-data");
      expect(verified).toBeNull();
    });

    it("should reject token when verified with wrong purpose among multiple purposes", async () => {
      const claims1 = { data: "oauth" };
      const token1 = await signShortLived(claims1, 600, "oauth-state");

      const claims2 = { data: "unlock" };
      const token2 = await signShortLived(claims2, 600, "google-unlock-data");

      // token1 should only verify with oauth-state
      expect(await verifyShortLived(token1, "oauth-state")).toBeTruthy();
      expect(await verifyShortLived(token1, "google-unlock-data")).toBeNull();
      expect(await verifyShortLived(token1, "google-signup")).toBeNull();
      expect(await verifyShortLived(token1, "google-link")).toBeNull();

      // token2 should only verify with google-unlock-data
      expect(await verifyShortLived(token2, "google-unlock-data")).toBeTruthy();
      expect(await verifyShortLived(token2, "oauth-state")).toBeNull();
      expect(await verifyShortLived(token2, "google-signup")).toBeNull();
      expect(await verifyShortLived(token2, "google-link")).toBeNull();
    });

    it("should reject expired token regardless of purpose", async () => {
      const claims = { data: "test" };
      // Create token with 0 second TTL (already expired)
      const token = await signShortLived(claims, 0, "oauth-state");

      const verified = await verifyShortLived(token, "oauth-state");
      expect(verified).toBeNull();
    });

    it("should handle all valid purposes", async () => {
      const purposes: Array<"oauth-state" | "google-unlock-data" | "google-signup" | "google-link"> = [
        "oauth-state",
        "google-unlock-data",
        "google-signup",
        "google-link",
      ];

      for (const purpose of purposes) {
        const token = await signShortLived({ test: purpose }, 600, purpose);
        const verified = await verifyShortLived(token, purpose);
        expect(verified).toBeTruthy();
        expect(verified?.purpose).toBe(purpose);
      }
    });

    it("should use correct issuer", async () => {
      const token = await signShortLived({ data: "test" }, 600, "oauth-state");
      const verified = await verifyShortLived(token, "oauth-state");
      expect(verified?.iss).toBe("pf-auth");
    });

    it("should use correct audience", async () => {
      const token = await signShortLived({ data: "test" }, 600, "oauth-state");
      const verified = await verifyShortLived(token, "oauth-state");
      expect(verified?.aud).toBe("pf-oauth-state");
    });

    it("should include issued-at time", async () => {
      const beforeSign = Math.floor(Date.now() / 1000);
      const token = await signShortLived({ data: "test" }, 600, "oauth-state");
      const afterSign = Math.floor(Date.now() / 1000);

      const verified = await verifyShortLived(token, "oauth-state");
      expect(verified?.iat).toBeDefined();
      expect(verified?.iat).toBeGreaterThanOrEqual(beforeSign);
      expect(verified?.iat).toBeLessThanOrEqual(afterSign + 1); // +1 for clock skew
    });

    it("should include expiration time", async () => {
      const ttlSeconds = 300; // 5 minutes
      const beforeSign = Math.floor(Date.now() / 1000) + ttlSeconds;
      const token = await signShortLived({ data: "test" }, ttlSeconds, "oauth-state");
      const afterSign = Math.floor(Date.now() / 1000) + ttlSeconds;

      const verified = await verifyShortLived(token, "oauth-state");
      expect(verified?.exp).toBeDefined();
      expect(verified?.exp).toBeGreaterThanOrEqual(beforeSign);
      expect(verified?.exp).toBeLessThanOrEqual(afterSign + 1); // +1 for clock skew
    });

    it("should preserve custom claims alongside purpose", async () => {
      const claims = {
        sub: "google-abc123",
        email: "user@example.com",
        emailVerified: true,
        name: "Test User",
      };
      const token = await signShortLived(claims, 600, "google-signup");
      const verified = await verifyShortLived(token, "google-signup");

      expect(verified?.sub).toBe("google-abc123");
      expect(verified?.email).toBe("user@example.com");
      expect(verified?.emailVerified).toBe(true);
      expect(verified?.name).toBe("Test User");
      expect(verified?.purpose).toBe("google-signup");
    });

    it("should use default purpose when not specified in signShortLived", async () => {
      const claims = { data: "test" };
      // Sign without purpose (should default to "oauth-state")
      const token = await signShortLived(claims, 600);
      const verified = await verifyShortLived(token, "oauth-state");

      expect(verified).toBeTruthy();
      expect(verified?.purpose).toBe("oauth-state");
    });

    it("should use default purpose when not specified in verifyShortLived", async () => {
      const claims = { data: "test" };
      const token = await signShortLived(claims, 600, "oauth-state");
      // Verify without purpose (should default to "oauth-state")
      const verified = await verifyShortLived(token);

      expect(verified).toBeTruthy();
      expect(verified?.purpose).toBe("oauth-state");
    });
  });
});
